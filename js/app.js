document.addEventListener("DOMContentLoaded", () => {
    const loginScreen = document.getElementById("login-screen");
    const appScreen = document.getElementById("app-screen");
    const loginForm = document.getElementById("login-form");
    const loginError = document.getElementById("login-error");
    
    // Auto-detect Host
    const ftpHostInput = document.getElementById("ftp-host");
    if (!ftpHostInput.value) {
        ftpHostInput.value = window.location.hostname || "localhost";
    }
    const fileList = document.getElementById("file-list");
    const currentPathInput = document.getElementById("current-path");
    let currentPath = "/";

    const contextMenu = document.getElementById("context-menu");
    let currentContextFile = null;
    
    const customModal = document.getElementById("custom-modal");
    const modalTitle = document.getElementById("modal-title");
    const modalBody = document.getElementById("modal-body");
    const modalCancel = document.getElementById("modal-cancel");
    const modalConfirm = document.getElementById("modal-confirm");

    document.addEventListener("click", () => {
        contextMenu.classList.add("hidden");
    });

    checkAuth();

    function checkAuth() {
        fetch("api.php?action=check_auth").then(res => res.json()).then(data => {
            if (data.success) { initApp(); }
            else { showLogin(); }
        }).catch(() => showLogin());
    }

    function showLogin() { if (window.finishLoader) window.finishLoader(); setTimeout(() => { const loader = document.getElementById("global-loader"); if (loader) { loader.style.opacity = "0"; loader.style.pointerEvents = "none"; setTimeout(() => loader.classList.add("hidden"), 500); } loginScreen.classList.remove("hidden"); appScreen.classList.add("hidden"); }, 800); }
    function showApp() { if (window.finishLoader) window.finishLoader(); setTimeout(() => { const loader = document.getElementById("global-loader"); if (loader) { loader.style.opacity = "0"; loader.style.pointerEvents = "none"; setTimeout(() => loader.classList.add("hidden"), 500); } loginScreen.classList.add("hidden"); appScreen.classList.remove("hidden"); }, 800); }
    
    function showModal(title, contentHTML, onConfirm) {
        modalTitle.textContent = title;
        modalBody.innerHTML = contentHTML;
        customModal.classList.remove("hidden");
        
        modalCancel.onclick = () => customModal.classList.add("hidden");
        modalConfirm.onclick = () => {
            const input = modalBody.querySelector("input");
            const result = input ? input.value : true;
            if (onConfirm(result) !== false) {
                customModal.classList.add("hidden");
            }
        };
        
        const input = modalBody.querySelector("input");
        if (input) {
            input.focus();
            if (input.type === "text" && input.value.includes(".")) {
                input.setSelectionRange(0, input.value.lastIndexOf("."));
            } else if (input.type === "text") {
                input.select();
            }
        }
    }

    loginForm.addEventListener("submit", (e) => {
        e.preventDefault();
        loginError.classList.add("hidden");
        const formData = new FormData();
        formData.append("host", document.getElementById("ftp-host").value);
        formData.append("port", document.getElementById("ftp-port").value);
        formData.append("username", document.getElementById("ftp-user").value);
        formData.append("password", document.getElementById("ftp-pass").value);
        const btn = loginForm.querySelector("button");
        btn.disabled = true; btn.textContent = "Connecting...";
        
        fetch("api.php?action=connect", { method: "POST", body: formData })
        .then(res => res.json()).then(data => {
            if (data.success) { initApp(); }
            else { loginError.textContent = data.message; loginError.classList.remove("hidden"); }
        }).catch(err => {
            loginError.textContent = "An error occurred connecting to the server."; loginError.classList.remove("hidden");
        }).finally(() => { btn.disabled = false; btn.textContent = "Connect"; });
    });

    document.getElementById("logout-btn").addEventListener("click", () => {
        fetch("api.php?action=logout").then(() => showLogin());
    });
    
    document.getElementById("btn-refresh").addEventListener("click", () => loadFiles(currentPath));
    
    document.getElementById("btn-up").addEventListener("click", () => {
        if (currentPath === "/") return;
        const parts = currentPath.split("/").filter(p => p);
        parts.pop();
        loadFiles("/" + parts.join("/"));
    });

    function loadFiles(path) {
        const formData = new FormData();
        formData.append("path", path);
        fileList.innerHTML = "<tr><td colspan=\"5\" class=\"text-center p-4 text-gray-500\">Loading...</td></tr>";
        fetch("api.php?action=list", { method: "POST", body: formData })
        .then(res => res.json()).then(data => {
            if (data.success) {
                currentPath = path; 
                currentPathInput.value = path; 
                window.location.hash = path;
                
                // Update Tree Highlighting
                document.querySelectorAll("#tree-root div").forEach(d => {
                    if (d.dataset.path === path) {
                        d.classList.add("bg-blue-100", "font-semibold", "text-blue-700");
                        d.classList.remove("hover:bg-blue-50", "text-gray-700");
                    } else {
                        d.classList.remove("bg-blue-100", "font-semibold", "text-blue-700");
                        d.classList.add("hover:bg-blue-50", "text-gray-700");
                    }
                });
                
                renderFiles(data.data.files);
            } else {
                showToast(data.message, "error");
                if (data.message === "Not connected" || data.message === "Session invalid") showLogin();
            }
        });
    }

    // --- TREE LOGIC ---
    const treeRoot = document.getElementById("tree-root");
    let treeLoadedPaths = {}; // keep track of loaded paths
    
    function loadTree(path, containerUl) {
        containerUl.innerHTML = '<li class="p-2 text-gray-400 text-xs italic">Loading...</li>';
        
        const fd = new FormData();
        fd.append("path", path);
        fetch("api.php?action=list", { method: "POST", body: fd })
        .then(res => res.json()).then(data => {
            if (data.success) {
                containerUl.innerHTML = "";
                const folders = data.data.files.filter(f => f.isDirectory && f.name !== "." && f.name !== "..");
                folders.sort((a,b) => a.name.localeCompare(b.name));
                
                if (folders.length === 0) {
                    containerUl.innerHTML = '';
                    if (containerUl.previousElementSibling) {
                        const toggleSpan = containerUl.previousElementSibling.firstElementChild;
                        if (toggleSpan && toggleSpan.tagName === 'SPAN') {
                            toggleSpan.style.opacity = '0';
                            toggleSpan.style.pointerEvents = 'none';
                        }
                    }
                    return;
                }
                
                folders.forEach(f => {
                    const fullPath = path === "/" ? "/" + f.name : path + "/" + f.name;
                    const li = document.createElement("li");
                    li.className = "select-none";
                    
                    const div = document.createElement("div");
                    div.dataset.path = fullPath; 
                    if (fullPath === currentPath) {
                        div.className = "flex items-center p-1 bg-blue-100 font-semibold text-blue-700 cursor-pointer text-sm rounded transition-colors group";
                    } else {
                        div.className = "flex items-center p-1 hover:bg-blue-50 cursor-pointer text-sm text-gray-700 rounded transition-colors group";
                    }
                    
                    // Toggle icon
                    const toggleSpan = document.createElement("span");
                    toggleSpan.className = "w-5 h-5 flex items-center justify-center mr-1 text-gray-400 hover:text-gray-700";
                    toggleSpan.innerHTML = '<i class="fas fa-caret-right"></i>';
                    
                    // Folder icon
                    const iconSpan = document.createElement("i");
                    iconSpan.className = "fas fa-folder text-yellow-400 mr-2 group-hover:text-yellow-500 transition-colors";
                    
                    // Name
                    const nameSpan = document.createElement("span");
                    nameSpan.className = "flex-1 truncate";
                    nameSpan.textContent = f.name;
                    
                    div.appendChild(toggleSpan);
                    div.appendChild(iconSpan);
                    div.appendChild(nameSpan);
                    
                    const subUl = document.createElement("ul");
                    subUl.className = "pl-4 hidden border-l border-gray-200 ml-2 mt-1 space-y-1";
                    
                    li.appendChild(div);
                    li.appendChild(subUl);
                    
                    // Toggle logic
                    let isLoaded = false;
                    let isOpen = false;
                    
                    toggleSpan.addEventListener("click", (e) => {
                        e.stopPropagation();
                        if (!isOpen) {
                            isOpen = true;
                            toggleSpan.innerHTML = '<i class="fas fa-caret-down"></i>';
                            subUl.classList.remove("hidden");
                            iconSpan.className = "fas fa-folder-open text-yellow-400 mr-2";
                            if (!isLoaded) {
                                loadTree(fullPath, subUl);
                                isLoaded = true;
                            }
                        } else {
                            isOpen = false;
                            toggleSpan.innerHTML = '<i class="fas fa-caret-right"></i>';
                            subUl.classList.add("hidden");
                            iconSpan.className = "fas fa-folder text-yellow-400 mr-2";
                        }
                    });
                    
                    // Navigate logic
                    div.addEventListener("click", () => {
                        // Highlight active
                        document.querySelectorAll("#tree-root div").forEach(d => d.classList.remove("bg-blue-100", "font-semibold", "text-blue-700"));
                        div.classList.add("bg-blue-100", "font-semibold", "text-blue-700");
                        
                        // If not open, open it
                        if(!isOpen) toggleSpan.click();
                        
                        loadFiles(fullPath);
                    });
                    
                    containerUl.appendChild(li);
                });
            } else {
                containerUl.innerHTML = '<li class="p-1 text-red-500 text-xs">Error</li>';
            }
        });
    }

    function initApp() {
        showApp();
        
        let initialPath = window.location.hash ? window.location.hash.substring(1) : "/";
        if (!initialPath.startsWith("/")) initialPath = "/" + initialPath;
        
        loadFiles(initialPath);
        
        // Initialize tree root
        treeRoot.innerHTML = "";
        
        // Add root node itself
        const rootLi = document.createElement("li");
        const rootDiv = document.createElement("div");
        if (currentPath === "/") {
            rootDiv.className = "flex items-center p-1 bg-blue-100 font-semibold text-blue-700 cursor-pointer text-sm rounded transition-colors mb-1";
        } else {
            rootDiv.className = "flex items-center p-1 hover:bg-blue-50 cursor-pointer text-sm text-gray-700 rounded transition-colors mb-1";
        }
        rootDiv.dataset.path = "/";
        rootDiv.innerHTML = '<span class="w-5 h-5 flex items-center justify-center mr-1 text-gray-700"><i class="fas fa-caret-down"></i></span><i class="fas fa-server text-gray-600 mr-2"></i><span class="flex-1 truncate">/ (Root)</span>';
        
        const rootSubUl = document.createElement("ul");
        rootSubUl.className = "pl-4 border-l border-gray-200 ml-2 space-y-1";
        
        rootLi.appendChild(rootDiv);
        rootLi.appendChild(rootSubUl);
        treeRoot.appendChild(rootLi);
        
        rootDiv.addEventListener("click", () => {
            document.querySelectorAll("#tree-root div").forEach(d => d.classList.remove("bg-blue-100", "font-semibold", "text-blue-700"));
            rootDiv.classList.add("bg-blue-100", "font-semibold", "text-blue-700");
            loadFiles("/");
        });
        
        loadTree("/", rootSubUl);
    }

    function renderFiles(files) {
        fileList.innerHTML = "";
        document.getElementById("selectAll").checked = false;
        
        // This will be called if the function is defined
        if (typeof updateBulkDeleteButton === 'function') updateBulkDeleteButton();
        
        if (files.length === 0) { fileList.innerHTML = '<tr><td colspan="5" class="text-center p-4 text-gray-500">Empty directory</td></tr>'; return; }
        
        files.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
        });

        files.forEach(file => {
            if (file.name === "." || file.name === "..") return;
            const tr = document.createElement("tr");
            tr.className = "hover:bg-blue-50 border-b cursor-pointer transition-colors";
            const icon = file.isDirectory ? "<i class=\"fas fa-folder text-yellow-400 mr-2\"></i>" : "<i class=\"fas fa-file text-gray-400 mr-2\"></i>";
            tr.innerHTML = `
                <td class="p-2 text-center" onclick="event.stopPropagation()"><input type="checkbox" class="file-checkbox cursor-pointer" data-name="${file.name}" data-isdir="${file.isDirectory}"></td>
                <td class="p-2 whitespace-nowrap"><div class="flex items-center">${icon}<span class="font-medium text-gray-800">${file.name}</span></div></td>
                <td class="p-2 text-sm text-gray-600">${file.isDirectory ? "-" : file.size}</td>
                <td class="p-2 text-sm text-gray-600">${file.date}</td>
                <td class="p-2 text-sm text-gray-600 font-mono">${file.permissions}</td>
            `;
            
            tr.addEventListener("contextmenu", (e) => { e.preventDefault(); currentContextFile = file; const ctxEdit = document.getElementById("ctx-edit"); const ctxExtract = document.getElementById("ctx-extract"); if (file.isDirectory) { ctxEdit.classList.add("hidden"); ctxExtract.innerHTML = '<i class="fas fa-file-archive w-4 text-orange-500 mr-2"></i> Compress (Zip)'; ctxExtract.dataset.action = "zip"; } else if (file.name.toLowerCase().endsWith(".zip")) { ctxEdit.classList.add("hidden"); ctxExtract.innerHTML = '<i class="fas fa-file-archive w-4 text-orange-500 mr-2"></i> Extract (Unzip)'; ctxExtract.dataset.action = "unzip"; } else { ctxEdit.classList.remove("hidden"); ctxExtract.innerHTML = '<i class="fas fa-file-archive w-4 text-orange-500 mr-2"></i> Compress (Zip)'; ctxExtract.dataset.action = "zip"; } contextMenu.style.left = "-9999px";
                contextMenu.classList.remove("hidden");
                
                const menuWidth = contextMenu.offsetWidth;
                const menuHeight = contextMenu.offsetHeight;
                const windowWidth = window.innerWidth;
                const windowHeight = window.innerHeight;
                
                let x = e.pageX;
                let y = e.pageY;
                
                // Adjust if it goes off the right edge
                if (x + menuWidth > windowWidth) {
                    x = windowWidth - menuWidth - 5;
                }
                
                // Adjust if it goes off the bottom edge
                if (y + menuHeight > windowHeight) {
                    y = windowHeight - menuHeight - 5;
                }
                
                contextMenu.style.left = x + "px";
                contextMenu.style.top = y + "px";
            });

            if (file.isDirectory) {
                tr.addEventListener("dblclick", () => {
                    const newPath = currentPath === "/" ? "/" + file.name : currentPath + "/" + file.name;
                    loadFiles(newPath);
                });
            }
            fileList.appendChild(tr);
        });
    }

    document.getElementById("ctx-rename").addEventListener("click", () => {
        if (!currentContextFile) return;
        showModal(
            "Rename",
            `<input type="text" class="w-full border p-2 rounded focus:outline-none focus:ring focus:border-blue-300" value="${currentContextFile.name}">`,
            (newName) => {
                if (!newName || newName === currentContextFile.name) return true;
                const oldPath = currentPath === "/" ? "/" + currentContextFile.name : currentPath + "/" + currentContextFile.name;
                const newPath = currentPath === "/" ? "/" + newName : currentPath + "/" + newName;
                const fd = new FormData();
                fd.append("oldName", oldPath); fd.append("newName", newPath);
                fetch("api.php?action=rename", { method: "POST", body: fd })
                    .then(res => res.json()).then(data => { if (data.success) loadFiles(currentPath); else showToast(data.message, "error"); });
                return true;
            }
        );
    });

    document.getElementById("ctx-delete").addEventListener("click", () => {
        if (!currentContextFile) return;
        showModal(
            "Delete Confirmation",
            `<p>Are you sure you want to permanently delete <strong>${currentContextFile.name}</strong>?</p>`,
            () => {
                const path = currentPath === "/" ? "/" + currentContextFile.name : currentPath + "/" + currentContextFile.name;
                const fd = new FormData();
                fd.append("path", path); fd.append("isDir", currentContextFile.isDirectory);
                fetch("api.php?action=delete", { method: "POST", body: fd })
                    .then(res => res.json()).then(data => { if (data.success) loadFiles(currentPath); else showToast(data.message, "error"); });
                return true;
            }
        );
    });

    document.getElementById("btn-new-file").addEventListener("click", () => {
        showModal(
            "New File",
            `<p class="mb-2">Enter file name:</p><input type="text" class="w-full border p-2 rounded focus:outline-none focus:ring focus:border-blue-300" value="new_file.php">`,
            (name) => {
                if (!name) return true;
                const path = currentPath === "/" ? "/" + name : currentPath + "/" + name;
                const fd = new FormData();
                fd.append("path", path);
                fd.append("content", "");
                fetch("api.php?action=save_file", { method: "POST", body: fd })
                    .then(res => res.json()).then(data => { 
                        if (data.success) {
                            showToast(`File created successfully.`, "success");
                            loadFiles(currentPath);
                        } else {
                            showToast(data.message, "error");
                        }
                    });
            }
        );
    });

    document.getElementById("btn-new-folder").addEventListener("click", () => {
        showModal(
            "New Folder",
            `<p class="mb-2">Enter folder name:</p><input type="text" class="w-full border p-2 rounded focus:outline-none focus:ring focus:border-blue-300" value="New Folder">`,
            (name) => {
                if (!name) return true;
                const path = currentPath === "/" ? "/" + name : currentPath + "/" + name;
                const fd = new FormData();
                fd.append("path", path);
                fetch("api.php?action=mkdir", { method: "POST", body: fd })
                    .then(res => res.json()).then(data => { if (data.success) loadFiles(currentPath); else showToast(data.message, "error"); });
                return true;
            }
        );
    });

    function showFolderSelectorModal(title, initialPath, onConfirm) {
        modalTitle.textContent = title;
        modalBody.innerHTML = `
            <p class="mb-2 text-gray-700">Select destination folder:</p>
            <div class="flex items-center mb-2">
                <button id="modal-btn-up" class="p-1 bg-gray-200 hover:bg-gray-300 rounded mr-2"><i class="fas fa-level-up-alt"></i></button>
                <input type="text" id="modal-current-path" value="${initialPath}" class="w-full border p-1 rounded text-sm bg-gray-50 mr-2" readonly>
                <button id="modal-btn-new-folder" class="p-1 bg-green-500 hover:bg-green-600 text-white rounded px-2 text-sm" title="New Folder"><i class="fas fa-folder-plus"></i></button>
            </div>
            <div class="border rounded h-40 overflow-y-auto bg-white" id="modal-folder-list">
                <div class="p-2 text-center text-gray-500 text-sm">Loading...</div>
            </div>
        `;
        customModal.classList.remove("hidden");
        
        let navPath = initialPath;
        
        function loadFolders(p) {
            const fd = new FormData();
            fd.append("path", p);
            document.getElementById("modal-folder-list").innerHTML = '<div class="p-2 text-center text-gray-500 text-sm">Loading...</div>';
            
            fetch("api.php?action=list", { method: "POST", body: fd })
            .then(res => res.json()).then(data => {
                if(data.success) {
                    navPath = p;
                    document.getElementById("modal-current-path").value = navPath;
                    let html = '';
                    const folders = data.data.files.filter(f => f.isDirectory && f.name !== '.' && f.name !== '..');
                    if(folders.length === 0) {
                        html = '<div class="p-2 text-center text-gray-500 text-sm">No subfolders</div>';
                    } else {
                        folders.sort((a,b) => a.name.localeCompare(b.name)).forEach(f => {
                            html += `<div class="p-2 hover:bg-blue-50 cursor-pointer border-b text-sm folder-item" data-name="${f.name}"><i class="fas fa-folder text-yellow-400 mr-2"></i> ${f.name}</div>`;
                        });
                    }
                    document.getElementById("modal-folder-list").innerHTML = html;
                    
                    document.querySelectorAll('.folder-item').forEach(el => {
                        el.addEventListener('click', function() {
                            const newP = navPath === '/' ? '/' + this.dataset.name : navPath + '/' + this.dataset.name;
                            loadFolders(newP);
                        });
                    });
                }
            });
        }
        
        loadFolders(navPath);
        
        document.getElementById("modal-btn-up").onclick = () => {
            if(navPath === '/') return;
            const parts = navPath.split('/').filter(p=>p);
            parts.pop();
            loadFolders('/' + parts.join('/'));
        };
        
        document.getElementById("modal-btn-new-folder").onclick = () => {
            const name = prompt("Enter new folder name:");
            if (!name) return;
            const newFolderPath = navPath === '/' ? '/' + name : navPath + '/' + name;
            const fd = new FormData();
            fd.append("path", newFolderPath);
            fetch("api.php?action=mkdir", { method: "POST", body: fd })
                .then(res => res.json()).then(data => { 
                    if (data.success) loadFolders(navPath); 
                    else showToast(data.message, "error"); 
                });
        };
        
        modalCancel.onclick = () => customModal.classList.add("hidden");
        modalConfirm.onclick = () => {
            if (onConfirm(navPath) !== false) {
                customModal.classList.add("hidden");
            }
        };
    }

    document.getElementById("ctx-move").addEventListener("click", () => {
        if (!currentContextFile) return;
        const oldPath = currentPath === "/" ? "/" + currentContextFile.name : currentPath + "/" + currentContextFile.name;
        
        showFolderSelectorModal("Move " + currentContextFile.name, currentPath, (destFolder) => {
            const newPath = destFolder === "/" ? "/" + currentContextFile.name : destFolder + "/" + currentContextFile.name;
            if (newPath === oldPath) return true; // nothing to do
            
            const fd = new FormData();
            fd.append("oldName", oldPath);
            fd.append("newName", newPath);
            
            fetch("api.php?action=rename", { method: "POST", body: fd })
                .then(res => res.json()).then(data => { if (data.success) loadFiles(currentPath); else showToast(data.message, "error"); });
            return true;
        });
    });

    document.getElementById("ctx-copy").addEventListener("click", () => {
        if (!currentContextFile) return;
        if (currentContextFile.isDirectory) { showToast("Copying directories is not supported yet.", "error"); return; }
        const oldPath = currentPath === "/" ? "/" + currentContextFile.name : currentPath + "/" + currentContextFile.name;
        
        showFolderSelectorModal("Copy " + currentContextFile.name, currentPath, (destFolder) => {
            let finalName = currentContextFile.name;
            if (destFolder === currentPath) {
                finalName = prompt("Copying to same folder, enter new name:", currentContextFile.name + "_copy");
                if (!finalName) return true;
            }
            
            const newPath = destFolder === "/" ? "/" + finalName : destFolder + "/" + finalName;
            
            const fd = new FormData();
            fd.append("oldPath", oldPath); fd.append("newPath", newPath);
            fetch("api.php?action=copy", { method: "POST", body: fd })
                .then(res => res.json()).then(data => { if (data.success) loadFiles(currentPath); else showToast(data.message, "error"); });
            return true;
        });
    });

    document.getElementById("ctx-chmod").addEventListener("click", () => {
        if (!currentContextFile) return;
        const path = currentPath === "/" ? "/" + currentContextFile.name : currentPath + "/" + currentContextFile.name;
        showModal(
            "Change Permissions (CHMOD)",
            `<p class="mb-2">Enter numeric permissions (e.g., 0644 or 0755):</p><input type="text" class="w-full border p-2 rounded focus:outline-none focus:ring focus:border-blue-300" value="0644">`,
            (perms) => {
                if (!perms) return true;
                const fd = new FormData();
                fd.append("path", path); fd.append("permissions", perms);
                fetch("api.php?action=chmod", { method: "POST", body: fd })
                    .then(res => res.json()).then(data => { if (data.success) loadFiles(currentPath); else showToast(data.message, "error"); });
                return true;
            }
        );
    });

    // File Transfers (Phase 3)
    const fileUpload = document.getElementById("file-upload");
    const dropOverlay = document.getElementById("drop-overlay");
    const progressContainer = document.getElementById("upload-progress-container");
    const uploadFilename = document.getElementById("upload-filename");
    const uploadPercent = document.getElementById("upload-percent");
    const uploadBar = document.getElementById("upload-bar");
    const mainArea = document.querySelector("main");

    mainArea.addEventListener("dragover", (e) => { e.preventDefault(); dropOverlay.classList.remove("hidden"); });
    mainArea.addEventListener("dragleave", (e) => { e.preventDefault(); if (e.target === dropOverlay) dropOverlay.classList.add("hidden"); });
    mainArea.addEventListener("drop", (e) => {
        e.preventDefault(); dropOverlay.classList.add("hidden");
        if (e.dataTransfer.files.length > 0) handleUploads(e.dataTransfer.files);
    });
    
    fileUpload.addEventListener("change", (e) => {
        if (e.target.files.length > 0) handleUploads(e.target.files);
    });

    async function handleUploads(files) {
        progressContainer.classList.remove("hidden");
        const chunkSize = 2 * 1024 * 1024; // 2MB chunk bypass
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            uploadFilename.textContent = `Uploading ${file.name} (${i+1}/${files.length})`;
            uploadPercent.textContent = "0%";
            uploadBar.style.width = "0%";
            
            const totalChunks = Math.ceil(file.size / chunkSize) || 1;
            for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
                const start = chunkIndex * chunkSize;
                const chunk = file.slice(start, start + chunkSize);
                
                const fd = new FormData();
                fd.append("file", chunk);
                fd.append("path", currentPath === "/" ? "/" + file.name : currentPath + "/" + file.name);
                fd.append("chunkIndex", chunkIndex);
                fd.append("totalChunks", totalChunks);
                
                try {
                    const res = await fetch("api.php?action=upload_chunk", { method: "POST", body: fd });
                    const data = await res.json();
                    if (!data.success) throw new Error(data.message);
                    
                    const percent = Math.round(((chunkIndex + 1) / totalChunks) * 100);
                    uploadPercent.textContent = percent + "%";
                    uploadBar.style.width = percent + "%";
                } catch (err) {
                    showToast(`Failed to upload ${file.name}: ${err.message}`, "error");
                    break;
                }
            }
        }
        progressContainer.classList.add("hidden");
        loadFiles(currentPath);
        fileUpload.value = ""; 
    }

    document.getElementById("ctx-download").addEventListener("click", () => {
        if (!currentContextFile) return;
        if (currentContextFile.isDirectory) { showToast("Cannot download directories.", "error"); return; }
        const path = currentPath === "/" ? "/" + currentContextFile.name : currentPath + "/" + currentContextFile.name;
        window.location.href = `api.php?action=download&path=${encodeURIComponent(path)}`;
    });



    // Phase 4: Editor & Archiving
    const editorModal = document.getElementById("editor-modal");
    let aceEditor = null; if (window.ace) { aceEditor = ace.edit("editor-container"); aceEditor.setTheme("ace/theme/monokai"); aceEditor.setOptions({ fontSize: "14pt", showPrintMargin: false }); }
    const editorFilename = document.getElementById("editor-filename");
    const editorBtnSave = document.getElementById("editor-btn-save");
    const editorBtnClose = document.getElementById("editor-btn-close");
    const editorStatus = document.getElementById("editor-status");
    let editingPath = "";

    document.getElementById("ctx-edit").addEventListener("click", () => {
        if (!currentContextFile) return;
        if (currentContextFile.isDirectory) { showToast("Cannot edit a directory.", "error"); return; }
        
        editingPath = currentPath === "/" ? "/" + currentContextFile.name : currentPath + "/" + currentContextFile.name;
        const fd = new FormData();
        fd.append("path", editingPath);
        
        editorFilename.textContent = `Editing: ${currentContextFile.name}`;
        editorStatus.textContent = "Loading...";
        editorModal.classList.remove("hidden");
        if (aceEditor) { aceEditor.setValue("Loading...", -1); aceEditor.setReadOnly(true); }
        
        fetch("api.php?action=read_file", { method: "POST", body: fd })
        .then(res => res.json()).then(data => {
            if (data.success) {
                if (aceEditor) { const modelist = ace.require("ace/ext/modelist"); const mode = modelist.getModeForPath(editingPath).mode; aceEditor.session.setMode(mode); aceEditor.setValue(data.data.content, -1); aceEditor.setReadOnly(false); }
                editorStatus.textContent = "";
            } else {
                editorStatus.textContent = "Failed to load.";
                showToast(data.message, "error");
            }
        });
    });

    editorBtnSave.addEventListener("click", () => {
        editorStatus.textContent = "Saving...";
        const fd = new FormData();
        fd.append("path", editingPath);
        fd.append("content", aceEditor ? aceEditor.getValue() : "");
        fetch("api.php?action=save_file", { method: "POST", body: fd })
        .then(res => res.json()).then(data => {
            if (data.success) {
                editorStatus.textContent = "Saved successfully!";
                loadFiles(currentPath);
                setTimeout(() => editorStatus.textContent = "", 3000);
            } else {
                editorStatus.textContent = "Failed to save.";
                showToast(data.message, "error");
            }
        });
    });

    editorBtnClose.addEventListener("click", () => {
        editorModal.classList.add("hidden");
        editingPath = "";
    });

    document.getElementById("ctx-extract").addEventListener("click", () => {
        if (!currentContextFile) return;
        
        const action = document.getElementById("ctx-extract").dataset.action;
        
        if (action === "zip") {
            showToast("Compressing via FTP takes a very long time and is unsupported for now. Please zip files locally before uploading.", "error");
            return;
        }
        
        const path = currentPath === "/" ? "/" + currentContextFile.name : currentPath + "/" + currentContextFile.name;
        
        showFolderSelectorModal("Extract " + currentContextFile.name + " to:", currentPath, (destFolder) => {
            const fd = new FormData();
            fd.append("path", path);
            fd.append("dest", destFolder);
            
            // Show progress overlay
            progressContainer.classList.remove("hidden");
            uploadFilename.textContent = `Extracting ${currentContextFile.name}...`;
            uploadPercent.textContent = "Please wait";
            uploadBar.style.width = "100%";
            uploadBar.classList.add("animate-pulse");
            
            fetch("api.php?action=unzip", { method: "POST", body: fd })
            .then(res => res.json()).then(data => {
                progressContainer.classList.add("hidden");
                uploadBar.classList.remove("animate-pulse");
                if (data.success) {
                    if (destFolder === currentPath) {
                        loadFiles(currentPath);
                        showToast("Extracted successfully!", "success");
                    } else {
                        showToast("Extracted successfully to " + destFolder, "success");
                    }
                } else {
                    showToast(data.message, "error");
                }
            }).catch(err => {
                progressContainer.classList.add("hidden");
                showToast("Extraction failed.", "error");
            });
            return true;
        });
    });


    // Bulk Delete Logic
    const selectAll = document.getElementById("selectAll");
    const btnBulkDelete = document.getElementById("btn-bulk-delete");
    const bulkDeleteCount = document.getElementById("bulk-delete-count");
    
    selectAll.addEventListener("change", (e) => {
        const checkboxes = document.querySelectorAll(".file-checkbox");
        checkboxes.forEach(cb => cb.checked = e.target.checked);
        updateBulkDeleteButton();
    });
    
    document.getElementById("file-list").addEventListener("change", (e) => {
        if (e.target.classList.contains("file-checkbox")) {
            updateBulkDeleteButton();
            const total = document.querySelectorAll(".file-checkbox").length;
            const checked = document.querySelectorAll(".file-checkbox:checked").length;
            selectAll.checked = total > 0 && total === checked;
        }
    });
    
    window.updateBulkDeleteButton = function() {
        if (!btnBulkDelete) return;
        const count = document.querySelectorAll(".file-checkbox:checked").length;
        if (count > 0) {
            btnBulkDelete.classList.remove("hidden");
            bulkDeleteCount.textContent = count;
        } else {
            btnBulkDelete.classList.add("hidden");
        }
    }
    
    btnBulkDelete.addEventListener("click", () => {
        const checked = Array.from(document.querySelectorAll(".file-checkbox:checked"));
        if (checked.length === 0) return;
        
        showModal(
            "Bulk Delete",
            `<p>Are you sure you want to permanently delete <strong>` + checked.length + `</strong> items?</p>`,
            async () => {
                let successCount = 0;
                let failCount = 0;
                let total = checked.length;
                
                progressContainer.classList.remove("hidden");
                const iconElem = document.querySelector("#upload-progress-container .fa-cloud-upload-alt") || document.querySelector("#upload-progress-container .fa-trash-alt");
                if (iconElem) iconElem.className = "fas fa-trash-alt mr-2";
                
                for (let i = 0; i < total; i++) {
                    let cb = checked[i];
                    const name = cb.dataset.name;
                    const isDir = cb.dataset.isdir === "true";
                    const path = currentPath === "/" ? "/" + name : currentPath + "/" + name;
                    
                    uploadFilename.textContent = `Deleting: ${name}`;
                    uploadPercent.textContent = `${i + 1} / ${total}`;
                    uploadBar.style.width = (((i) / total) * 100) + "%";
                    
                    const fd = new FormData();
                    fd.append("path", path);
                    fd.append("isDir", isDir);
                    
                    try {
                        const res = await fetch("api.php?action=delete", { method: "POST", body: fd });
                        const data = await res.json();
                        if (data.success) successCount++;
                        else failCount++;
                    } catch (e) { failCount++; }
                }
                
                progressContainer.classList.add("hidden");
                if (iconElem) iconElem.className = "fas fa-cloud-upload-alt mr-2"; // Restore icon
                
                if (failCount === 0) showToast(`Deleted ` + successCount + ` items successfully.`, "success");
                else showToast(`Deleted ` + successCount + ` items. ` + failCount + ` failed.`, "error");
                
                loadFiles(currentPath);
                return true;
            }
        );
    });
    window.addEventListener("hashchange", () => { let hashPath = window.location.hash ? window.location.hash.substring(1) : "/"; if (!hashPath.startsWith("/")) hashPath = "/" + hashPath; if (currentPath !== hashPath) { loadFiles(hashPath); } });
});

    function showToast(message, type = "success") {
        let toastContainer = document.getElementById("toast-container");
        if (!toastContainer) {
            toastContainer = document.createElement("div");
            toastContainer.id = "toast-container";
            toastContainer.className = "fixed top-4 right-4 z-50 flex flex-col space-y-2"; toastContainer.style.zIndex = "150";
            document.body.appendChild(toastContainer);
        }
        
        const toast = document.createElement("div");
        const bgColor = type === "error" ? "bg-red-500" : "bg-green-500";
        const icon = type === "error" ? "fa-exclamation-circle" : "fa-check-circle";
        
        toast.className = `${bgColor} text-white px-4 py-3 rounded shadow-lg flex items-center transform transition-all duration-300 translate-x-full opacity-0`;
        toast.innerHTML = `<i class="fas ${icon} mr-2"></i> <span>${message}</span>`;
        
        toastContainer.appendChild(toast);
        
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                toast.classList.remove("translate-x-full", "opacity-0");
            });
        });
        
        setTimeout(() => {
            toast.classList.add("translate-x-full", "opacity-0");
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }


