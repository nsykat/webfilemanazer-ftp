<?php
session_start();

header("Content-Type: application/json");

$action = $_GET["action"] ?? "";

function sendResponse($success, $data = [], $message = "") {
    echo json_encode(["success" => $success, "data" => $data, "message" => $message]);
    exit;
}

if ($action === "connect") {
    $host = $_POST["host"] ?? "";
    $port = $_POST["port"] ?? 21;
    $user = $_POST["username"] ?? "";
    $pass = $_POST["password"] ?? "";
    
    if (empty($host) || empty($user)) {
        sendResponse(false, [], "Missing credentials");
    }
    
    $conn = @ftp_connect($host, $port, 10);
    if (!$conn) {
        sendResponse(false, [], "Could not connect to $host on port $port");
    }
    
    $login = @ftp_login($conn, $user, $pass);
    if (!$login) {
        sendResponse(false, [], "Incorrect username or password");
    }
    
    ftp_pasv($conn, true);
    
    $_SESSION["ftp_host"] = $host;
    $_SESSION["ftp_port"] = $port;
    $_SESSION["ftp_user"] = $user;
    $_SESSION["ftp_pass"] = $pass;
    
    ftp_close($conn);
    sendResponse(true, [], "Connected successfully");
}

function getFtpConnection() {
    if (!isset($_SESSION["ftp_host"])) {
        sendResponse(false, [], "Not connected");
    }
    
    $conn = @ftp_connect($_SESSION["ftp_host"], $_SESSION["ftp_port"], 10);
    if (!$conn) sendResponse(false, [], "Connection lost");
    
    $login = @ftp_login($conn, $_SESSION["ftp_user"], $_SESSION["ftp_pass"]);
    if (!$login) sendResponse(false, [], "Authentication failed");
    
    ftp_pasv($conn, true);
    return $conn;
}

if ($action === "check_auth") {
    if (isset($_SESSION["ftp_host"])) {
        $conn = @ftp_connect($_SESSION["ftp_host"], $_SESSION["ftp_port"], 10);
        if ($conn && @ftp_login($conn, $_SESSION["ftp_user"], $_SESSION["ftp_pass"])) {
            sendResponse(true);
        } else {
            session_destroy();
            sendResponse(false, [], "Session invalid");
        }
    } else {
        sendResponse(false, [], "Not logged in");
    }
}

if ($action === "logout") {
    session_destroy();
    sendResponse(true, [], "Logged out");
}

if ($action === "list") {
    $conn = getFtpConnection();
    $path = $_POST["path"] ?? ".";
    
    $rawList = ftp_rawlist($conn, $path);
    $parsed = [];
    
    if (is_array($rawList)) {
        foreach ($rawList as $line) {
            if (preg_match("/^([drwx\-]+)\s+\d+\s+\w+\s+\w+\s+(\d+)\s+(\w+\s+\d+\s+[\d:]+)\s+(.+)$/", $line, $matches)) {
                $isDir = strpos($matches[1], "d") === 0;
                $parsed[] = [
                    "name" => $matches[4],
                    "isDirectory" => $isDir,
                    "size" => $matches[2],
                    "date" => $matches[3],
                    "permissions" => $matches[1]
                ];
            }
        }
    }
    
    ftp_close($conn);
    sendResponse(true, ["files" => $parsed, "currentPath" => $path]);
}

if ($action === "rename") {
    $conn = getFtpConnection();
    $old = $_POST["oldName"] ?? "";
    $new = $_POST["newName"] ?? "";
    if (empty($old) || empty($new)) sendResponse(false, [], "Missing names");
    if (@ftp_rename($conn, $old, $new)) {
        sendResponse(true, [], "Renamed successfully");
    } else {
        sendResponse(false, [], "Failed to rename");
    }
}

if ($action === "delete") {
    $conn = getFtpConnection();
    $path = $_POST["path"] ?? "";
    $isDir = $_POST["isDir"] === "true";
    if (empty($path)) sendResponse(false, [], "Missing path");
    
    $success = $isDir ? @ftp_rmdir($conn, $path) : @ftp_delete($conn, $path);
    if ($success) {
        sendResponse(true, [], "Deleted successfully");
    } else {
        sendResponse(false, [], "Failed to delete (if directory, it must be empty)");
    }
}

if ($action === "chmod") {
    $conn = getFtpConnection();
    $path = $_POST["path"] ?? "";
    $perms = octdec($_POST["permissions"] ?? "0644");
    if (empty($path)) sendResponse(false, [], "Missing path");
    
    if (@ftp_chmod($conn, $perms, $path) !== false) {
        sendResponse(true, [], "Permissions changed");
    } else {
        sendResponse(false, [], "Failed to change permissions");
    }
}

if ($action === "copy") {
    $conn = getFtpConnection();
    $old = $_POST["oldPath"] ?? "";
    $new = $_POST["newPath"] ?? "";
    if (empty($old) || empty($new)) sendResponse(false, [], "Missing paths");
    
    // Download to temp stream and upload to new path
    $tempHandle = fopen('php://temp', 'r+');
    if (@ftp_fget($conn, $tempHandle, $old, FTP_BINARY)) {
        rewind($tempHandle);
        if (@ftp_fput($conn, $new, $tempHandle, FTP_BINARY)) {
            sendResponse(true, [], "Copied successfully");
        } else {
            sendResponse(false, [], "Failed to write copy");
        }
    } else {
        sendResponse(false, [], "Failed to read source file (directories cannot be copied this way)");
    }
    fclose($tempHandle);
}

if ($action === "mkdir") {
    $conn = getFtpConnection();
    $path = $_POST["path"] ?? "";
    if (empty($path)) sendResponse(false, [], "Missing path");
    
    if (@ftp_mkdir($conn, $path)) {
        sendResponse(true, [], "Folder created");
    } else {
        sendResponse(false, [], "Failed to create folder");
    }
}

if ($action === "download") {
    $conn = getFtpConnection();
    $path = $_GET["path"] ?? "";
    if (empty($path)) die("Missing path");
    
    header('Content-Type: application/octet-stream');
    header('Content-Disposition: attachment; filename="' . basename($path) . '"');
    
    // Stream directly to output buffer to bypass memory limits
    $tempHandle = fopen('php://output', 'w');
    @ftp_fget($conn, $tempHandle, $path, FTP_BINARY);
    fclose($tempHandle);
    exit;
}

if ($action === "upload_chunk") {
    $conn = getFtpConnection();
    $path = $_POST["path"] ?? "";
    $chunkIndex = (int)($_POST["chunkIndex"] ?? 0);
    $totalChunks = (int)($_POST["totalChunks"] ?? 1);
    $fileName = basename($path);
    $tempFilePath = sys_get_temp_dir() . '/' . md5($_SESSION['ftp_user'] . $path) . '_' . $fileName;

    if (!isset($_FILES['file'])) sendResponse(false, [], "No file uploaded");

    // Append chunk to temp file
    $out = fopen($tempFilePath, $chunkIndex === 0 ? "wb" : "ab");
    if ($out) {
        $in = fopen($_FILES['file']['tmp_name'], "rb");
        if ($in) {
            while ($buff = fread($in, 4096)) {
                fwrite($out, $buff);
            }
        }
        fclose($in);
        fclose($out);
    }

    if ($chunkIndex === $totalChunks - 1) {
        // Final chunk received, upload to FTP
        $upload = @ftp_put($conn, $path, $tempFilePath, FTP_BINARY);
        unlink($tempFilePath); // clean up
        if ($upload) {
            sendResponse(true, [], "Upload complete");
        } else {
            sendResponse(false, [], "Failed to upload to FTP server");
        }
    } else {
        sendResponse(true, [], "Chunk $chunkIndex received");
    }
}

if ($action === "unzip") {
    $conn = getFtpConnection();
    $path = $_POST["path"] ?? "";
    $destFolder = $_POST["dest"] ?? dirname($path);
    if (empty($path)) sendResponse(false, [], "Missing path");
    
    // Helper to create dirs recursively
    if (!function_exists('makeDirRecursively')) {
        function makeDirRecursively($conn, $path) {
            $parts = explode('/', trim($path, '/'));
            $current = '';
            foreach ($parts as $part) {
                if ($part === '') continue;
                $current .= '/' . $part;
                @ftp_mkdir($conn, $current);
            }
        }
    }
    
    $tempZipPath = sys_get_temp_dir() . '/' . uniqid('ftp_zip_') . '.zip';
    if (@ftp_get($conn, $tempZipPath, $path, FTP_BINARY)) {
        $zip = new ZipArchive();
        if ($zip->open($tempZipPath) === true) {
            $extractDir = sys_get_temp_dir() . '/' . uniqid('ftp_extract_');
            mkdir($extractDir);
            $zip->extractTo($extractDir);
            $zip->close();
            
            $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($extractDir, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::SELF_FIRST);
            foreach ($iterator as $file) {
                $relPath = str_replace($extractDir . DIRECTORY_SEPARATOR, '', $file->getPathname());
                $relPath = str_replace('\\', '/', $relPath);
                $remotePath = $destFolder === '/' ? '/' . $relPath : $destFolder . '/' . $relPath;
                
                if ($file->isDir()) {
                    makeDirRecursively($conn, $remotePath);
                } else {
                    $dir = dirname($remotePath);
                    makeDirRecursively($conn, $dir); 
                    @ftp_put($conn, $remotePath, $file->getPathname(), FTP_BINARY);
                }
            }
            sendResponse(true, [], "Unzipped successfully");
        } else {
            sendResponse(false, [], "Failed to open zip");
        }
    } else {
        sendResponse(false, [], "Failed to download zip");
    }
}

if ($action === "read_file") {
    $conn = getFtpConnection();
    $path = $_POST["path"] ?? "";
    if (empty($path)) sendResponse(false, [], "Missing path");
    
    $tempHandle = fopen('php://temp', 'r+');
    if (@ftp_fget($conn, $tempHandle, $path, FTP_BINARY)) {
        rewind($tempHandle);
        $content = stream_get_contents($tempHandle);
        sendResponse(true, ["content" => $content]);
    } else {
        sendResponse(false, [], "Failed to read file");
    }
    fclose($tempHandle);
}

if ($action === "save_file") {
    $conn = getFtpConnection();
    $path = $_POST["path"] ?? "";
    $content = $_POST["content"] ?? "";
    if (empty($path)) sendResponse(false, [], "Missing path");
    
    $tempHandle = fopen('php://temp', 'r+');
    fwrite($tempHandle, $content);
    rewind($tempHandle);
    if (@ftp_fput($conn, $path, $tempHandle, FTP_BINARY)) {
        sendResponse(true, [], "Saved");
    } else {
        sendResponse(false, [], "Failed to save");
    }
    fclose($tempHandle);
}

sendResponse(false, [], "Invalid action");

