document.addEventListener('DOMContentLoaded', () => {
    const navMenu = document.getElementById('script-nav');
    const welcomeView = document.getElementById('welcome-view');
    const scriptView = document.getElementById('script-view');
    const currentScriptTitle = document.getElementById('current-script-title');
    const formInputs = document.getElementById('form-inputs');
    const scriptForm = document.getElementById('script-form');
    const consoleOutput = document.getElementById('console-output');
    const clearConsoleBtn = document.getElementById('clear-console');
    const loadingOverlay = document.getElementById('loading-overlay');
    
    // Editor UI Elements
    const navEditorBtn = document.getElementById('nav-editor');
    navEditorBtn.setAttribute('data-script', 'editor');
    const editorView = document.getElementById('editor-view');
    const saveEditorBtn = document.getElementById('save-editor-btn');
    const brandLogo = document.getElementById('brand-logo');
    
    // Equipment Editor UI Elements
    const navEquipmentBtn = document.getElementById('nav-equipment');
    navEquipmentBtn.setAttribute('data-script', 'equipment');
    const equipmentView = document.getElementById('equipment-view');
    const equipmentContainer = document.getElementById('equipment-editor-container');
    const saveEquipmentBtn = document.getElementById('save-equipment-btn');
    const addCategoryBtn = document.getElementById('add-category-btn');
    let equipmentData = { categories: [] };
    
    // Special Event UI Elements
    const navSpecialEventBtn = document.getElementById('nav-special-event');
    navSpecialEventBtn.setAttribute('data-script', 'special');
    const specialEventView = document.getElementById('special-event-view');
    const saveSpecialBtn = document.getElementById('save-special-btn');
    const clearSpecialBtn = document.getElementById('clear-special-btn');

    let scriptsConfig = [];
    let activeScript = null;
    let easyMDE = null;

    brandLogo.addEventListener('click', () => {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(v => v.classList.remove('active'));
        welcomeView.classList.add('active');
        currentScriptTitle.innerText = "Dashboard";
    });

    // Fetch available scripts from backend
    fetch('/api/scripts')
        .then(res => res.json())
        .then(data => {
            scriptsConfig = data;
            renderSidebar();
        })
        .catch(err => console.error("Failed to load scripts:", err));

    // Markdown Editor Logic
    navEditorBtn.addEventListener('click', () => {
        // Toggle view
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        navEditorBtn.classList.add('active');
        
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        editorView.classList.add('active');
        currentScriptTitle.innerText = "Reminders Editor";

        // Initialize editor if not already done
        if (!easyMDE) {
            easyMDE = new EasyMDE({ 
                element: document.getElementById('markdown-editor'),
                spellChecker: false,
                maxHeight: "450px",
                sideBySideFullscreen: false,
                status: ["lines", "words", "cursor"],
                toolbar: ["bold", "italic", "heading", "|", "quote", "unordered-list", "ordered-list", "|", "preview", "side-by-side", "fullscreen", "|", "guide"]
            });
        }

        // Fetch current reminders
        loadingOverlay.classList.remove('hidden');
        fetch('/api/reminders')
            .then(res => res.text())
            .then(text => {
                easyMDE.value(text);
                loadingOverlay.classList.add('hidden');
            })
            .catch(err => {
                loadingOverlay.classList.add('hidden');
                alert('Failed to load reminders file.');
            });
    });

    saveEditorBtn.addEventListener('click', () => {
        loadingOverlay.classList.remove('hidden');
        const content = easyMDE.value();
        
        fetch('/api/reminders', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: content
        })
        .then(res => res.json())
        .then(data => {
            loadingOverlay.classList.add('hidden');
            if (data.success) {
                // Flash success color on button temporarily
                const originalText = saveEditorBtn.innerHTML;
                saveEditorBtn.innerHTML = '<i class="fa-solid fa-check"></i> Saved!';
                saveEditorBtn.style.background = 'var(--success)';
                setTimeout(() => {
                    saveEditorBtn.innerHTML = originalText;
                    saveEditorBtn.style.background = '';
                }, 2000);
            }
        })
        .catch(err => {
            loadingOverlay.classList.add('hidden');
            alert('Failed to save reminders!');
        });
    });

    // Equipment Editor Logic
    navEquipmentBtn.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        navEquipmentBtn.classList.add('active');
        
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        equipmentView.classList.add('active');
        currentScriptTitle.innerText = "Equipment Status Editor";

        loadingOverlay.classList.remove('hidden');
        fetch('/api/equipment')
            .then(res => res.json())
            .then(data => {
                equipmentData = data;
                renderEquipmentEditor();
                loadingOverlay.classList.add('hidden');
            })
            .catch(err => {
                console.error(err);
                loadingOverlay.classList.add('hidden');
                alert('Failed to load equipment data.');
            });
    });

    function renderEquipmentEditor() {
        equipmentContainer.innerHTML = '';
        if (!equipmentData.categories || equipmentData.categories.length === 0) {
            equipmentContainer.innerHTML = `
                <div class="card" style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    <i class="fa-solid fa-folder-open" style="font-size: 2.5rem; margin-bottom: 12px; opacity: 0.5;"></i>
                    <p style="margin-bottom: 15px;">No equipment categories created yet.</p>
                    <button class="btn primary" onclick="document.getElementById('add-category-btn').click();"><i class="fa-solid fa-plus"></i> Add First Category</button>
                </div>
            `;
            return;
        }

        equipmentData.categories.forEach((cat, cIdx) => {
            const catDiv = document.createElement('div');
            catDiv.className = 'equipment-category-card';
            catDiv.draggable = true;
            
            // Category Header
            const header = document.createElement('div');
            header.className = 'equipment-category-header';
            
            header.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px; width: 60%;">
                    <div class="category-drag-handle" title="Drag to reorder category" style="cursor: grab;"><i class="fa-solid fa-grip-vertical"></i></div>
                    <i class="fa-solid fa-folder" style="color: var(--accent); font-size: 1.1rem;"></i>
                    <input type="text" class="equipment-category-input" value="${cat.name}" onchange="updateCategoryName(${cIdx}, this.value)" placeholder="Category Name (e.g. Engines, Cranes)">
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="btn secondary" style="padding: 6px 12px; font-size: 0.85rem;" onclick="addEquipmentItem(${cIdx})"><i class="fa-solid fa-plus"></i> Add Item</button>
                    <button class="btn danger" style="padding: 6px 10px;" title="Delete Category" onclick="removeCategory(${cIdx})"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            `;
            catDiv.appendChild(header);

            // Category Drag Events (Handle-Only)
            let isCategoryDrag = false;
            const catHandle = header.querySelector('.category-drag-handle');
            catHandle.addEventListener('mousedown', () => { isCategoryDrag = true; });
            window.addEventListener('mouseup', () => { isCategoryDrag = false; });

            catDiv.addEventListener('dragstart', (e) => {
                if (!isCategoryDrag && !e.target.closest('.category-drag-handle')) {
                    e.preventDefault();
                    return;
                }
                e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'category', cIdx }));
                e.dataTransfer.effectAllowed = 'move';
                catDiv.classList.add('is-dragging');
                
                // Defer adding collapse class by 1 event loop tick so native drag session locks in first
                setTimeout(() => {
                    equipmentContainer.classList.add('category-dragging-active');
                }, 0);
            });
            catDiv.addEventListener('dragend', () => {
                isCategoryDrag = false;
                catDiv.classList.remove('is-dragging');
                equipmentContainer.classList.remove('category-dragging-active');
                document.querySelectorAll('.equipment-category-card').forEach(c => c.classList.remove('drag-over'));
            });
            catDiv.addEventListener('dragover', (e) => {
                e.preventDefault();
                catDiv.classList.add('drag-over');
            });
            catDiv.addEventListener('dragleave', () => {
                catDiv.classList.remove('drag-over');
            });
            catDiv.addEventListener('drop', (e) => {
                e.preventDefault();
                catDiv.classList.remove('drag-over');
                equipmentContainer.classList.remove('category-dragging-active');
                try {
                    const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                    if (data.type === 'category' && data.cIdx !== cIdx) {
                        const [movedCat] = equipmentData.categories.splice(data.cIdx, 1);
                        equipmentData.categories.splice(cIdx, 0, movedCat);
                        renderEquipmentEditor();
                    }
                } catch (err) {}
            });
            
            // Items List
            const itemsList = document.createElement('div');
            itemsList.className = 'equipment-items-list';
            itemsList.style.display = 'flex';
            itemsList.style.flexDirection = 'column';
            itemsList.style.gap = '10px';
            
            if (!cat.items || cat.items.length === 0) {
                const emptyMsg = document.createElement('div');
                emptyMsg.style.padding = '15px';
                emptyMsg.style.textAlign = 'center';
                emptyMsg.style.color = 'var(--text-secondary)';
                emptyMsg.style.fontSize = '0.9rem';
                emptyMsg.style.fontStyle = 'italic';
                emptyMsg.innerText = 'No equipment in this category. Click "+ Add Item" above to add one.';
                itemsList.appendChild(emptyMsg);
            } else {
                const isMobileCranes = (cat.name || '').trim().toLowerCase() === 'mobile cranes';

                cat.items.forEach((item, iIdx) => {
                    const itemRow = document.createElement('div');
                    const scaleVal = item.scale || 'NO';
                    const hasScaleOk = scaleVal === 'OK';
                    const isAudited = !!item.blend_audit;
                    itemRow.className = `equipment-item-row ${isMobileCranes ? 'mobile-crane-row' : ''}`;
                    itemRow.draggable = true;
                    
                    let auditHtml = '';
                    if (isMobileCranes && hasScaleOk) {
                        auditHtml = `
                            <label class="blend-audit-container" data-audited="${isAudited ? 'true' : 'false'}" title="Toggle weekly audit status">
                                <span>Audit:</span>
                                <input type="checkbox" ${isAudited ? 'checked' : ''} onchange="handleAuditToggle(this, ${cIdx}, ${iIdx})">
                            </label>
                        `;
                    }

                    let scaleSelectHtml = '';
                    if (isMobileCranes) {
                        scaleSelectHtml = `
                            <select class="form-control input-scale-select" data-scale="${scaleVal}" onchange="handleScaleChange(this, ${cIdx}, ${iIdx})">
                                <option value="NO" ${(!item.scale || item.scale === 'NO' || item.scale === 'NONE') ? 'selected' : ''}>No Scale</option>
                                <option value="OK" ${item.scale === 'OK' ? 'selected' : ''}>Scale OK</option>
                                <option value="OS" ${item.scale === 'OS' ? 'selected' : ''}>Scale OS</option>
                            </select>
                        `;
                    }

                    const nameAndAuditCell = isMobileCranes ? `
                        <div class="unit-name-audit-group" style="display: flex; align-items: center; gap: 8px; width: 100%; min-width: 0;">
                            <input type="text" class="form-control input-unit-name" value="${item.name}" onchange="updateEquipmentItem(${cIdx}, ${iIdx}, 'name', this.value)" placeholder="Unit # / Name (e.g. MH65)" style="flex: 1; min-width: 0;">
                            ${auditHtml}
                        </div>
                    ` : `
                        <input type="text" class="form-control input-unit-name" value="${item.name}" onchange="updateEquipmentItem(${cIdx}, ${iIdx}, 'name', this.value)" placeholder="Unit # / Name (e.g. 1564)">
                    `;

                    itemRow.innerHTML = `
                        <div class="equipment-drag-handle" title="Drag to reorder item" style="cursor: grab;"><i class="fa-solid fa-grip-vertical"></i></div>
                        ${nameAndAuditCell}
                        ${scaleSelectHtml}
                        <select class="form-control input-status-select" data-status="${item.status}" onchange="this.setAttribute('data-status', this.value); updateEquipmentItem(${cIdx}, ${iIdx}, 'status', this.value)">
                            <option value="OK" ${item.status === 'OK' ? 'selected' : ''}>OK</option>
                            <option value="OS" ${item.status === 'OS' ? 'selected' : ''}>Out of Service</option>
                            <option value="PM" ${item.status === 'PM' ? 'selected' : ''}>Issue / PM</option>
                        </select>
                        <input type="text" class="form-control" value="${item.reason || ''}" onchange="updateEquipmentItem(${cIdx}, ${iIdx}, 'reason', this.value)" placeholder="Reason or maintenance notes...">
                        <button class="btn danger" style="padding: 6px 10px;" title="Delete Item" onclick="removeEquipmentItem(${cIdx}, ${iIdx})"><i class="fa-solid fa-trash-can"></i></button>
                    `;

                    // Item Drag Events (Handle-Only)
                    let isItemDrag = false;
                    const itemHandle = itemRow.querySelector('.equipment-drag-handle');
                    itemHandle.addEventListener('mousedown', () => { isItemDrag = true; });
                    window.addEventListener('mouseup', () => { isItemDrag = false; });

                    itemRow.addEventListener('dragstart', (e) => {
                        if (!isItemDrag && !e.target.closest('.equipment-drag-handle')) {
                            e.preventDefault();
                            return;
                        }
                        e.stopPropagation();
                        e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'item', cIdx, iIdx }));
                        e.dataTransfer.effectAllowed = 'move';
                        itemRow.classList.add('is-dragging');
                    });
                    itemRow.addEventListener('dragend', () => {
                        isItemDrag = false;
                        itemRow.classList.remove('is-dragging');
                        document.querySelectorAll('.equipment-item-row').forEach(r => r.classList.remove('drag-over'));
                    });
                    itemRow.addEventListener('dragover', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        itemRow.classList.add('drag-over');
                    });
                    itemRow.addEventListener('dragleave', () => {
                        itemRow.classList.remove('drag-over');
                    });
                    itemRow.addEventListener('drop', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        itemRow.classList.remove('drag-over');
                        try {
                            const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                            if (data.type === 'item' && data.cIdx === cIdx && data.iIdx !== iIdx) {
                                const category = equipmentData.categories[cIdx];
                                const [movedItem] = category.items.splice(data.iIdx, 1);
                                category.items.splice(iIdx, 0, movedItem);
                                renderEquipmentEditor();
                            }
                        } catch (err) {}
                    });

                    itemsList.appendChild(itemRow);
                });
            }
            
            catDiv.appendChild(itemsList);
            equipmentContainer.appendChild(catDiv);
        });
    }

    // Global exposed functions for inline handlers
    window.handleScaleChange = (selectElem, cIdx, iIdx) => {
        const val = selectElem.value;
        selectElem.setAttribute('data-scale', val);
        equipmentData.categories[cIdx].items[iIdx].scale = val;
        
        const row = selectElem.closest('.equipment-item-row');
        if (!row) return;

        const group = row.querySelector('.unit-name-audit-group');
        if (!group) return;

        let auditContainer = group.querySelector('.blend-audit-container');
        if (val === 'OK') {
            if (!auditContainer) {
                const isAudited = !!equipmentData.categories[cIdx].items[iIdx].blend_audit;
                auditContainer = document.createElement('label');
                auditContainer.className = 'blend-audit-container';
                auditContainer.setAttribute('data-audited', isAudited ? 'true' : 'false');
                auditContainer.title = 'Toggle weekly audit status';
                auditContainer.innerHTML = `
                    <span>Audit:</span>
                    <input type="checkbox" ${isAudited ? 'checked' : ''} onchange="handleAuditToggle(this, ${cIdx}, ${iIdx})">
                `;
                group.appendChild(auditContainer);
            } else {
                auditContainer.style.display = 'inline-flex';
            }
        } else {
            if (auditContainer) {
                auditContainer.remove();
            }
        }
    };

    window.handleAuditToggle = (checkboxElem, cIdx, iIdx) => {
        const checked = checkboxElem.checked;
        equipmentData.categories[cIdx].items[iIdx].blend_audit = checked;
        const container = checkboxElem.closest('.blend-audit-container');
        if (container) {
            container.setAttribute('data-audited', checked ? 'true' : 'false');
        }
    };

    window.updateCategoryName = (cIdx, val) => { equipmentData.categories[cIdx].name = val; };
    window.updateEquipmentItem = (cIdx, iIdx, key, val) => { equipmentData.categories[cIdx].items[iIdx][key] = val; };
    window.removeCategory = (cIdx) => { equipmentData.categories.splice(cIdx, 1); renderEquipmentEditor(); };
    window.removeEquipmentItem = (cIdx, iIdx) => { equipmentData.categories[cIdx].items.splice(iIdx, 1); renderEquipmentEditor(); };
    window.addEquipmentItem = (cIdx) => { 
        if(!equipmentData.categories[cIdx].items) equipmentData.categories[cIdx].items = [];
        equipmentData.categories[cIdx].items.push({ name: 'New Item', status: 'OK', reason: '' }); 
        renderEquipmentEditor(); 
    };
    
    addCategoryBtn.addEventListener('click', () => {
        if(!equipmentData.categories) equipmentData.categories = [];
        equipmentData.categories.push({ name: 'New Category', items: [] });
        renderEquipmentEditor();
    });
    
    saveEquipmentBtn.addEventListener('click', () => {
        loadingOverlay.classList.remove('hidden');
        fetch('/api/equipment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(equipmentData)
        })
        .then(res => res.json())
        .then(data => {
            loadingOverlay.classList.add('hidden');
            if (data.success) {
                const originalText = saveEquipmentBtn.innerHTML;
                saveEquipmentBtn.innerHTML = '<i class="fa-solid fa-check"></i> Saved!';
                saveEquipmentBtn.style.background = 'var(--success)';
                setTimeout(() => {
                    saveEquipmentBtn.innerHTML = originalText;
                    saveEquipmentBtn.style.background = '';
                }, 2000);
            }
        })
        .catch(err => {
            loadingOverlay.classList.add('hidden');
            alert('Failed to save equipment data!');
        });
    });

    // Special Event Logic
    navSpecialEventBtn.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        navSpecialEventBtn.classList.add('active');
        
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        specialEventView.classList.add('active');
        currentScriptTitle.innerText = "Special Event Editor";
        
        // Fetch current event data
        fetch('/api/special-event')
            .then(res => res.json())
            .then(data => {
                document.getElementById('special-input-title').value = data.title || '';
                document.getElementById('special-input-desc').value = data.description || '';
                document.getElementById('special-input-duration').value = data.duration || 20;
                document.getElementById('special-input-end').value = data.endTime || '';
                if (data.image) {
                    document.getElementById('special-img-preview-container').style.display = 'block';
                    document.getElementById('special-img-preview').src = data.image + '?t=' + new Date().getTime();
                } else {
                    document.getElementById('special-img-preview-container').style.display = 'none';
                }
            }).catch(e => console.log('No active special event.'));
    });

    saveSpecialBtn.addEventListener('click', () => {
        const formData = new FormData();
        formData.append('title', document.getElementById('special-input-title').value);
        formData.append('description', document.getElementById('special-input-desc').value);
        formData.append('duration', document.getElementById('special-input-duration').value);
        formData.append('endTime', document.getElementById('special-input-end').value);
        
        const imgInput = document.getElementById('special-input-img');
        if (imgInput.files.length > 0) {
            formData.append('image', imgInput.files[0]);
        }
        
        loadingOverlay.classList.remove('hidden');
        fetch('/api/special-event', {
            method: 'POST',
            body: formData
        }).then(res => res.json()).then(data => {
            loadingOverlay.classList.add('hidden');
            if (data.success) {
                const originalText = saveSpecialBtn.innerHTML;
                saveSpecialBtn.innerHTML = '<i class="fa-solid fa-check"></i> Published!';
                saveSpecialBtn.style.background = 'var(--success)';
                if (data.image) {
                    document.getElementById('special-img-preview-container').style.display = 'block';
                    document.getElementById('special-img-preview').src = data.image + '?t=' + new Date().getTime();
                }
                setTimeout(() => {
                    saveSpecialBtn.innerHTML = originalText;
                    saveSpecialBtn.style.background = '';
                }, 2000);
            }
        });
    });

    clearSpecialBtn.addEventListener('click', () => {
        if (!confirm('Are you sure you want to delete the active special event?')) return;
        loadingOverlay.classList.remove('hidden');
        fetch('/api/special-event', { method: 'DELETE' })
            .then(res => res.json())
            .then(data => {
                loadingOverlay.classList.add('hidden');
                document.getElementById('special-input-title').value = '';
                document.getElementById('special-input-desc').value = '';
                document.getElementById('special-input-duration').value = '20';
                document.getElementById('special-input-end').value = '';
                document.getElementById('special-input-img').value = '';
                document.getElementById('special-img-preview-container').style.display = 'none';
            });
    });

    // ── Shift Schedules Editor Logic ─────────────────────────────────────────
    const navShiftsBtn = document.getElementById('nav-shifts');
    navShiftsBtn.setAttribute('data-script', 'shifts');
    const shiftEditorView = document.getElementById('shift-editor-view');
    const shiftsContainer = document.getElementById('shifts-container');
    const saveShiftsBtn = document.getElementById('save-shifts-btn');
    const addShiftBtn = document.getElementById('add-shift-btn');
    const shiftsStatus = document.getElementById('shifts-status');
    let shiftsData = { shifts: [] };

    const ALL_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    navShiftsBtn.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        navShiftsBtn.classList.add('active');
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        shiftEditorView.classList.add('active');
        currentScriptTitle.innerText = 'Shift Schedules';
        loadShifts();
    });

    function loadShifts() {
        loadingOverlay.classList.remove('hidden');
        fetch('/api/shifts')
            .then(res => res.json())
            .then(data => {
                loadingOverlay.classList.add('hidden');
                shiftsData = data && data.shifts ? data : { shifts: [] };
                renderShiftEditor();
            })
            .catch(err => {
                loadingOverlay.classList.add('hidden');
                shiftsStatus.style.display = 'block';
                shiftsStatus.innerHTML = '<span style="color:var(--error);"><i class="fa-solid fa-triangle-exclamation"></i> Failed to load shifts file.</span>';
            });
    }

    function renderShiftEditor() {
        shiftsContainer.innerHTML = '';
        if (!shiftsData.shifts || shiftsData.shifts.length === 0) {
            shiftsContainer.innerHTML = `
                <div class="card" style="text-align: center; padding: 40px;">
                    <i class="fa-solid fa-clock-rotate-left" style="font-size: 3rem; color: var(--text-secondary); margin-bottom: 15px;"></i>
                    <h4>No Shifts Configured</h4>
                    <p style="color: var(--text-secondary); margin-bottom: 20px;">Click "Add Shift" to create your first work shift schedule.</p>
                    <button class="btn primary" onclick="addShift()"><i class="fa-solid fa-plus"></i> Add First Shift</button>
                </div>
            `;
            return;
        }

        shiftsData.shifts.forEach((shift, sIdx) => {
            const card = document.createElement('div');
            card.className = 'shift-card';
            card.setAttribute('data-index', sIdx);

            const hasSplit = shift.days2 && shift.days2.length > 0;

            card.innerHTML = `
                <div class="shift-card-header">
                    <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                        <i class="fa-solid fa-grip-vertical shift-drag-handle" style="color: var(--text-secondary); cursor: grab; font-size: 1.1rem;" title="Drag to reorder"></i>
                        <input type="text" class="shift-name-input" value="${shift.name || ''}" placeholder="Shift Name (e.g. Day Shift)" onchange="updateShiftField(${sIdx}, 'name', this.value)">
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <button class="btn secondary" style="font-size: 0.85rem; padding: 6px 10px;" onclick="toggleShiftSplit(${sIdx})">
                            <i class="fa-solid ${hasSplit ? 'fa-minus' : 'fa-plus'}"></i> ${hasSplit ? 'Remove Split Schedule' : 'Add Split / Weekend Hours'}
                        </button>
                        <button class="btn danger" style="padding: 6px 10px;" title="Delete Shift" onclick="removeShift(${sIdx})">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </div>

                <!-- Primary Schedule -->
                <div style="margin-bottom: 12px;">
                    <label style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 6px; display: block;">Working Days</label>
                    <div class="days-pills-container">
                        ${ALL_DAYS.map(day => `
                            <div class="day-pill ${(shift.days || []).includes(day) ? 'active' : ''}" onclick="toggleShiftDay(${sIdx}, '${day}', false)">${day}</div>
                        `).join('')}
                    </div>
                </div>

                <div class="shift-time-row">
                    <div>
                        <label style="font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); display: block; margin-bottom: 4px;">Start Time</label>
                        <input type="time" class="form-control" value="${shift.start || '07:00'}" onchange="updateShiftField(${sIdx}, 'start', this.value)">
                    </div>
                    <div>
                        <label style="font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); display: block; margin-bottom: 4px;">End Time</label>
                        <input type="time" class="form-control" value="${shift.end || '15:00'}" onchange="updateShiftField(${sIdx}, 'end', this.value)">
                    </div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 18px;">
                        ${(shift.end && shift.start && shift.end <= shift.start) ? '<span style="color: #f59e0b;"><i class="fa-solid fa-moon"></i> Overnight Shift</span>' : '<span><i class="fa-solid fa-sun"></i> Same-Day Shift</span>'}
                    </div>
                </div>

                <!-- Secondary / Split Schedule (Optional) -->
                ${hasSplit ? `
                    <div class="shift-split-section">
                        <div style="font-size: 0.85rem; font-weight: 700; color: var(--accent); margin-bottom: 8px;"><i class="fa-solid fa-calendar-week"></i> Secondary / Weekend Hours</div>
                        <div style="margin-bottom: 12px;">
                            <div class="days-pills-container">
                                ${ALL_DAYS.map(day => `
                                    <div class="day-pill ${(shift.days2 || []).includes(day) ? 'active' : ''}" onclick="toggleShiftDay(${sIdx}, '${day}', true)">${day}</div>
                                `).join('')}
                            </div>
                        </div>
                        <div class="shift-time-row">
                            <div>
                                <label style="font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); display: block; margin-bottom: 4px;">Secondary Start Time</label>
                                <input type="time" class="form-control" value="${shift.start2 || '07:00'}" onchange="updateShiftField(${sIdx}, 'start2', this.value)">
                            </div>
                            <div>
                                <label style="font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); display: block; margin-bottom: 4px;">Secondary End Time</label>
                                <input type="time" class="form-control" value="${shift.end2 || '15:00'}" onchange="updateShiftField(${sIdx}, 'end2', this.value)">
                            </div>
                            <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 18px;">
                                ${(shift.end2 && shift.start2 && shift.end2 <= shift.start2) ? '<span style="color: #f59e0b;"><i class="fa-solid fa-moon"></i> Overnight</span>' : '<span><i class="fa-solid fa-sun"></i> Same-Day</span>'}
                            </div>
                        </div>
                    </div>
                ` : ''}
            `;

            shiftsContainer.appendChild(card);
        });
    }

    addShiftBtn.addEventListener('click', () => {
        if (!shiftsData.shifts) shiftsData.shifts = [];
        shiftsData.shifts.push({
            name: `Shift ${String.fromCharCode(65 + shiftsData.shifts.length)}`,
            days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
            start: "07:00",
            end: "15:00"
        });
        renderShiftEditor();
    });

    saveShiftsBtn.addEventListener('click', () => {
        loadingOverlay.classList.remove('hidden');
        fetch('/api/shifts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(shiftsData)
        })
        .then(res => res.json())
        .then(data => {
            loadingOverlay.classList.add('hidden');
            if (data.success) {
                const orig = saveShiftsBtn.innerHTML;
                saveShiftsBtn.innerHTML = '<i class="fa-solid fa-check"></i> Saved & Synced!';
                saveShiftsBtn.style.background = 'var(--success)';
                setTimeout(() => {
                    saveShiftsBtn.innerHTML = orig;
                    saveShiftsBtn.style.background = '';
                }, 3000);
            }
        })
        .catch(err => {
            loadingOverlay.classList.add('hidden');
            alert('Failed to save shifts: ' + err.message);
        });
    });

    // Global shift helpers
    window.addShift = () => {
        addShiftBtn.click();
    };
    window.removeShift = (sIdx) => {
        if (confirm(`Delete ${shiftsData.shifts[sIdx].name || 'this shift'}?`)) {
            shiftsData.shifts.splice(sIdx, 1);
            renderShiftEditor();
        }
    };
    window.updateShiftField = (sIdx, field, val) => {
        if (shiftsData.shifts[sIdx]) {
            shiftsData.shifts[sIdx][field] = val;
        }
    };
    window.toggleShiftDay = (sIdx, day, isSecondary) => {
        const shift = shiftsData.shifts[sIdx];
        if (!shift) return;
        const key = isSecondary ? 'days2' : 'days';
        if (!shift[key]) shift[key] = [];
        const idx = shift[key].indexOf(day);
        if (idx > -1) {
            shift[key].splice(idx, 1);
        } else {
            shift[key].push(day);
        }
        renderShiftEditor();
    };
    window.toggleShiftSplit = (sIdx) => {
        const shift = shiftsData.shifts[sIdx];
        if (!shift) return;
        if (shift.days2 && shift.days2.length > 0) {
            delete shift.days2;
            delete shift.start2;
            delete shift.end2;
        } else {
            shift.days2 = ["Sat", "Sun"];
            shift.start2 = "07:00";
            shift.end2 = "15:00";
        }
        renderShiftEditor();
    };

    // ── Site Settings Logic ──────────────────────────────────────────────────
    const navSiteSettingsBtn = document.getElementById('nav-site-settings');
    navSiteSettingsBtn.setAttribute('data-script', 'site-settings');
    const siteSettingsView = document.getElementById('site-settings-view');
    const saveSiteSettingsBtn = document.getElementById('save-site-settings-btn');
    const siteSettingsStatus = document.getElementById('site-settings-status');

    navSiteSettingsBtn.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        navSiteSettingsBtn.classList.add('active');
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        siteSettingsView.classList.add('active');
        currentScriptTitle.innerText = 'Site Settings';

        fetch('/api/site-config')
            .then(res => res.json())
            .then(cfg => {
                document.getElementById('cfg-site-name').value     = cfg.site_name     || '';
                document.getElementById('cfg-site-id').value       = cfg.site_id       || '';
                document.getElementById('cfg-latitude').value      = cfg.latitude      ?? '';
                document.getElementById('cfg-longitude').value     = cfg.longitude     ?? '';
                document.getElementById('cfg-timezone').value      = cfg.timezone      || '';
                document.getElementById('cfg-vercel-url').value    = cfg.vercel_api_url || '';
                document.getElementById('cfg-admin-username').value = cfg.admin_username || 'admin';
                document.getElementById('cfg-admin-password').value = '';
                loadSeniorityOverrides();
            })
            .catch(() => {
                siteSettingsStatus.style.display = 'block';
                siteSettingsStatus.innerHTML = '<span style="color:var(--danger)"><i class="fa-solid fa-triangle-exclamation"></i> Failed to load site config.</span>';
            });
    });

    // ── Seniority Overrides Editor Functions ──────────────────────────────────
    let seniorityOverridesData = {};

    function loadSeniorityOverrides() {
        const container = document.getElementById('seniority-table-container');
        if (!container) return;
        fetch('/api/seniority')
            .then(res => res.json())
            .then(data => {
                seniorityOverridesData = data && typeof data === 'object' ? data : {};
                renderSeniorityTable();
            })
            .catch(() => {
                seniorityOverridesData = {};
                renderSeniorityTable();
            });
    }

    function renderSeniorityTable() {
        const container = document.getElementById('seniority-table-container');
        if (!container) return;
        container.innerHTML = '';
        
        const keys = Object.keys(seniorityOverridesData);
        if (keys.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 15px; color: var(--text-secondary); background: rgba(0,0,0,0.2); border-radius: 6px; font-size: 0.9rem;">
                    No seniority overrides configured. Click <strong>Add Employee</strong> to create one.
                </div>
            `;
            return;
        }

        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        table.style.fontSize = '0.9rem';
        table.innerHTML = `
            <thead>
                <tr style="text-align: left; color: var(--text-secondary); border-bottom: 1px solid var(--border);">
                    <th style="padding: 8px;">Employee Name</th>
                    <th style="padding: 8px;">Hire Date (YYYY-MM-DD)</th>
                    <th style="padding: 8px; width: 40px;"></th>
                </tr>
            </thead>
            <tbody id="seniority-table-body"></tbody>
        `;
        container.appendChild(table);

        const tbody = table.querySelector('#seniority-table-body');
        keys.forEach(name => {
            const dateVal = seniorityOverridesData[name] || '';
            const row = document.createElement('tr');
            row.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
            row.innerHTML = `
                <td style="padding: 6px 8px;">
                    <input type="text" class="form-control seniority-name-input" value="${name}" placeholder="e.g. Harold Hamilton" style="font-size: 0.85rem; padding: 6px 8px;">
                </td>
                <td style="padding: 6px 8px;">
                    <input type="date" class="form-control seniority-date-input" value="${dateVal}" style="font-size: 0.85rem; padding: 6px 8px; font-family: monospace;">
                </td>
                <td style="padding: 6px 8px; text-align: center;">
                    <button class="btn danger" style="padding: 4px 8px; font-size: 0.8rem;" title="Delete Record"><i class="fa-solid fa-trash-can"></i></button>
                </td>
            `;

            const nameInput = row.querySelector('.seniority-name-input');
            const dateInput = row.querySelector('.seniority-date-input');
            const deleteBtn = row.querySelector('button');

            deleteBtn.addEventListener('click', () => {
                delete seniorityOverridesData[name];
                renderSeniorityTable();
            });

            tbody.appendChild(row);
        });
    }

    function collectSeniorityFromDOM() {
        const result = {};
        const rows = document.querySelectorAll('#seniority-table-body tr');
        rows.forEach(r => {
            const name = r.querySelector('.seniority-name-input')?.value.trim();
            const dateVal = r.querySelector('.seniority-date-input')?.value.trim();
            if (name && dateVal) {
                result[name] = dateVal;
            }
        });
        return result;
    }

    const addSeniorityBtn = document.getElementById('add-seniority-row-btn');
    if (addSeniorityBtn) {
        addSeniorityBtn.addEventListener('click', () => {
            seniorityOverridesData = collectSeniorityFromDOM();
            seniorityOverridesData[''] = '';
            renderSeniorityTable();
        });
    }

    saveSiteSettingsBtn.addEventListener('click', () => {
        const seniorityPayload = collectSeniorityFromDOM();
        fetch('/api/seniority', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(seniorityPayload)
        }).catch(err => console.warn('Failed to save seniority:', err));

        const payload = {
            site_name:        document.getElementById('cfg-site-name').value.trim(),
            site_id:          document.getElementById('cfg-site-id').value.trim(),
            latitude:         parseFloat(document.getElementById('cfg-latitude').value),
            longitude:        parseFloat(document.getElementById('cfg-longitude').value),
            timezone:         document.getElementById('cfg-timezone').value.trim(),
            vercel_api_url:   document.getElementById('cfg-vercel-url').value.trim(),
            admin_username:   document.getElementById('cfg-admin-username').value.trim()
        };

        const newPass = document.getElementById('cfg-admin-password').value.trim();
        if (newPass) {
            payload.admin_password = newPass;
        }

        fetch('/api/site-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(data => {
            siteSettingsStatus.style.display = 'block';
            if (data.success) {
                const orig = saveSiteSettingsBtn.innerHTML;
                saveSiteSettingsBtn.innerHTML = '<i class="fa-solid fa-check"></i> Saved!';
                saveSiteSettingsBtn.style.background = 'var(--success)';
                siteSettingsStatus.innerHTML = '<span style="color:var(--success)"><i class="fa-solid fa-check"></i> Settings saved. The kiosk will reload shortly.</span>';
                document.getElementById('cfg-admin-password').value = '';
                setTimeout(() => {
                    saveSiteSettingsBtn.innerHTML = orig;
                    saveSiteSettingsBtn.style.background = '';
                }, 2500);
            } else {
                siteSettingsStatus.innerHTML = `<span style="color:var(--danger)"><i class="fa-solid fa-triangle-exclamation"></i> Error: ${data.error}</span>`;
            }
        })
        .catch(() => {
            siteSettingsStatus.style.display = 'block';
            siteSettingsStatus.innerHTML = '<span style="color:var(--danger)"><i class="fa-solid fa-triangle-exclamation"></i> Network error saving settings.</span>';
        });
    });

    // ── Extras & Feature Toggles Logic ──────────────────────────────────────────
    const navExtrasBtn = document.getElementById('nav-extras');
    if (navExtrasBtn) navExtrasBtn.setAttribute('data-script', 'extras');
    const extrasView = document.getElementById('extras-view');
    const btnSaveExtras = document.getElementById('btn-save-extras');
    const extrasStatus = document.getElementById('extras-status');
    const themeModeSelect = document.getElementById('theme-mode-select');
    const dedicatedThemeSelect = document.getElementById('dedicated-theme-select');
    const bgStyleSelect = document.getElementById('bg-style-select');
    const chkShiftThemeDedication = document.getElementById('chk-shift-theme-dedication');
    const shiftThemesContainer = document.getElementById('shift-themes-container');

    const featureKeys = [
        'weather_fx', 'lightning_radar', 'osha_counter', 'production_tracker',
        'equipment_status', 'scale_audit_badges', 'shift_tracker', 'toolbox_talk',
        'reminders', 'anniversaries', 'safety_videos', 'mobile_qr', 'message_board'
    ];

    const themeOptionsList = [
        { val: 'default', label: '🌿 Classic Corporate Sage (Default)' },
        { val: 'obsidian', label: '🌌 Obsidian Midnight (Deep Dark & Ice Blue)' },
        { val: 'cyberpunk', label: '⚡ Cyberpunk Neon (Cyan & Magenta)' },
        { val: 'emerald', label: '🌲 Emerald Forest (Lush Green & Gold)' },
        { val: 'halloween', label: '🎃 Halloween' },
        { val: 'thanksgiving', label: '🦃 Thanksgiving' },
        { val: 'christmas', label: '🎄 Christmas' },
        { val: 'newyear', label: '🍾 New Year\'s' },
        { val: 'stpatricks', label: '☘️ St. Patrick\'s' },
        { val: 'july4', label: '🎆 4th of July' }
    ];

    if (navExtrasBtn) {
        navExtrasBtn.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            navExtrasBtn.classList.add('active');
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            if (extrasView) extrasView.classList.add('active');
            currentScriptTitle.innerText = 'Extras & Themes';

            Promise.all([
                fetch('/api/features').then(r => r.json()),
                fetch('/api/shifts').then(r => r.json()).catch(() => ({ shifts: [] }))
            ])
            .then(([featuresData, shiftsData]) => {
                if (themeModeSelect) themeModeSelect.value = featuresData.theme_mode || 'auto';
                if (dedicatedThemeSelect) dedicatedThemeSelect.value = featuresData.dedicated_theme || 'default';
                if (bgStyleSelect) bgStyleSelect.value = featuresData.bg_style || 'dots';
                if (chkShiftThemeDedication) chkShiftThemeDedication.checked = !!featuresData.shift_theme_dedication;
                
                // Render Dynamic Per-Shift Theme Dropdowns
                if (shiftThemesContainer) {
                    shiftThemesContainer.innerHTML = '';
                    const shifts = shiftsData.shifts || [];
                    const shiftThemes = featuresData.shift_themes || {};

                    if (shifts.length === 0) {
                        shiftThemesContainer.innerHTML = '<div style="color: var(--text-secondary); font-style: italic; font-size: 0.85rem;">No shifts configured in Shift Schedules yet.</div>';
                    } else {
                        shifts.forEach(shift => {
                            const group = document.createElement('div');
                            group.className = 'form-group';
                            group.style.background = 'rgba(0,0,0,0.2)';
                            group.style.padding = '12px 14px';
                            group.style.borderRadius = '8px';
                            group.style.border = '1px solid rgba(255,255,255,0.06)';

                            const days1 = (shift.days || []).join(', ');
                            let schedText = `${days1} (${shift.start} - ${shift.end})`;
                            if (shift.days2 && shift.days2.length > 0 && shift.start2 && shift.end2) {
                                const days2 = shift.days2.join(', ');
                                schedText += `<br><span style="color: var(--text-secondary); opacity: 0.85;">${days2} (${shift.start2} - ${shift.end2})</span>`;
                            }

                            const label = document.createElement('label');
                            label.style.display = 'flex';
                            label.style.flexDirection = 'column';
                            label.style.gap = '4px';
                            label.style.marginBottom = '8px';
                            label.innerHTML = `
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <strong style="color: #fff; font-size: 0.95rem;">${shift.name}</strong>
                                    <span style="font-size: 0.75rem; color: var(--brand-blue, #38bdf8); font-weight: bold; background: rgba(56, 189, 248, 0.1); padding: 2px 6px; border-radius: 4px;">${shift.start} - ${shift.end}</span>
                                </div>
                                <div style="font-size: 0.75rem; color: var(--text-secondary); line-height: 1.3;">${schedText}</div>
                            `;
                            group.appendChild(label);

                            const select = document.createElement('select');
                            select.className = 'form-control shift-theme-select';
                            select.setAttribute('data-shift-name', shift.name);

                            const activeThemeForShift = shiftThemes[shift.name] || 'default';
                            themeOptionsList.forEach(opt => {
                                const o = document.createElement('option');
                                o.value = opt.val;
                                o.innerText = opt.label;
                                if (opt.val === activeThemeForShift) o.selected = true;
                                select.appendChild(o);
                            });
                            group.appendChild(select);
                            shiftThemesContainer.appendChild(group);
                        });
                    }
                }

                const feats = featuresData.features || {};
                featureKeys.forEach(k => {
                    const el = document.getElementById(`feat-${k}`);
                    if (el) el.checked = feats[k] !== false;
                });
            })
            .catch(() => {
                if (extrasStatus) {
                    extrasStatus.style.display = 'block';
                    extrasStatus.innerHTML = '<span style="color:var(--danger)"><i class="fa-solid fa-triangle-exclamation"></i> Failed to load features config.</span>';
                }
            });
        });
    }

    if (btnSaveExtras) {
        btnSaveExtras.addEventListener('click', () => {
            const feats = {};
            featureKeys.forEach(k => {
                const el = document.getElementById(`feat-${k}`);
                feats[k] = el ? el.checked : true;
            });

            const shiftThemesPayload = {};
            document.querySelectorAll('.shift-theme-select').forEach(sel => {
                const sName = sel.getAttribute('data-shift-name');
                if (sName) {
                    shiftThemesPayload[sName] = sel.value;
                }
            });

            const payload = {
                theme_mode: themeModeSelect ? themeModeSelect.value : 'auto',
                dedicated_theme: dedicatedThemeSelect ? dedicatedThemeSelect.value : 'default',
                bg_style: bgStyleSelect ? bgStyleSelect.value : 'dots',
                shift_theme_dedication: chkShiftThemeDedication ? chkShiftThemeDedication.checked : false,
                shift_themes: shiftThemesPayload,
                features: feats
            };

            fetch('/api/features', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            .then(res => res.json())
            .then(data => {
                if (extrasStatus) extrasStatus.style.display = 'block';
                if (data.success) {
                    const orig = btnSaveExtras.innerHTML;
                    btnSaveExtras.innerHTML = '<i class="fa-solid fa-check"></i> Saved!';
                    btnSaveExtras.style.background = 'var(--success)';
                    if (extrasStatus) extrasStatus.innerHTML = '<span style="color:var(--success)"><i class="fa-solid fa-check"></i> Feature & theme preferences saved. Kiosk is updating!</span>';
                    setTimeout(() => {
                        btnSaveExtras.innerHTML = orig;
                        btnSaveExtras.style.background = '';
                    }, 2500);
                } else {
                    if (extrasStatus) extrasStatus.innerHTML = `<span style="color:var(--danger)"><i class="fa-solid fa-triangle-exclamation"></i> Error: ${data.error}</span>`;
                }
            })
            .catch(() => {
                if (extrasStatus) {
                    extrasStatus.style.display = 'block';
                    extrasStatus.innerHTML = '<span style="color:var(--danger)"><i class="fa-solid fa-triangle-exclamation"></i> Network error saving features.</span>';
                }
            });
        });
    }

    // ── Live Message Board Admin Controller (Issue #13) ─────────────────────────
    const navMessageBoardBtn = document.getElementById('nav-message-board');
    if (navMessageBoardBtn) navMessageBoardBtn.setAttribute('data-script', 'message-board');
    const messageBoardView = document.getElementById('message-board-view');
    const chkMbEnabled = document.getElementById('chk-mb-enabled');
    const chkMbApproval = document.getElementById('chk-mb-approval');
    const btnSaveMbSettings = document.getElementById('btn-save-mb-settings');
    const mbSettingsStatus = document.getElementById('mb-settings-status');
    const mbCategoriesList = document.getElementById('mb-categories-list');
    const btnAddCategory = document.getElementById('btn-add-category');
    const newCatName = document.getElementById('new-cat-name');
    const newCatIcon = document.getElementById('new-cat-icon');
    const newCatColor = document.getElementById('new-cat-color');
    const mbPostsContainer = document.getElementById('mb-posts-container');
    const mbBadgePending = document.getElementById('mb-badge-pending');

    let mbAdminData = { settings: {}, categories: [], messages: [] };
    let activeMbFilter = 'all';

    function loadMessageBoardAdmin() {
        if (!mbPostsContainer) return;
        mbPostsContainer.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 30px;">Loading posts...</div>';

        fetch('/api/message-board?admin=1')
            .then(res => {
                if (!res.ok) return fetch('/api/message-board').then(r => r.json());
                return res.json();
            })
            .then(data => {
                if (!data || !data.success) throw new Error((data && data.error) || 'Failed to load');
                mbAdminData = data;

                if (chkMbEnabled) chkMbEnabled.checked = data.settings.enabled !== false;
                if (chkMbApproval) chkMbApproval.checked = data.settings.require_approval === true;

                renderAdminCategories();
                renderAdminPosts();
            })
            .catch(err => {
                console.error('Error loading message board admin data:', err);
                mbPostsContainer.innerHTML = '<div style="color: var(--danger); text-align: center; padding: 20px;">Failed to load message board data. Please ensure the kiosk service is running.</div>';
            });
    }

    function renderAdminCategories() {
        if (!mbCategoriesList) return;
        mbCategoriesList.innerHTML = '';
        const cats = mbAdminData.categories || [];
        if (cats.length === 0) {
            mbCategoriesList.innerHTML = '<span style="color: var(--text-secondary); font-style: italic; font-size: 0.85rem;">No categories configured yet.</span>';
            return;
        }

        cats.forEach((cat, index) => {
            const pill = document.createElement('div');
            pill.style.background = 'rgba(255,255,255,0.05)';
            pill.style.border = `1px solid ${cat.color || '#38bdf8'}66`;
            pill.style.padding = '6px 12px';
            pill.style.borderRadius = '20px';
            pill.style.display = 'inline-flex';
            pill.style.alignItems = 'center';
            pill.style.gap = '8px';
            pill.style.fontSize = '0.85rem';

            pill.innerHTML = `
                <i class="${cat.icon || 'fa-solid fa-tag'}" style="color: ${cat.color || '#38bdf8'};"></i>
                <strong style="color: #fff;">${cat.name}</strong>
                <button type="button" class="btn-delete-cat" data-index="${index}" style="background: none; border: none; color: var(--danger, #ef4444); cursor: pointer; padding: 0 4px; font-size: 0.85rem;" title="Delete category">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            `;
            mbCategoriesList.appendChild(pill);
        });

        document.querySelectorAll('.btn-delete-cat').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.getAttribute('data-index'), 10);
                if (confirm(`Remove the category "${mbAdminData.categories[idx].name}"?`)) {
                    mbAdminData.categories.splice(idx, 1);
                    saveMbSettingsDirect();
                }
            });
        });
    }

    function renderAdminPosts() {
        if (!mbPostsContainer) return;
        const messages = mbAdminData.messages || [];
        const pendingCount = messages.filter(m => m.status === 'pending').length;

        if (mbBadgePending) {
            if (pendingCount > 0) {
                mbBadgePending.style.display = 'inline-block';
                mbBadgePending.innerText = pendingCount;
            } else {
                mbBadgePending.style.display = 'none';
            }
        }

        let filtered = messages;
        if (activeMbFilter === 'pending') filtered = messages.filter(m => m.status === 'pending');
        else if (activeMbFilter === 'approved') filtered = messages.filter(m => m.status === 'approved');
        else if (activeMbFilter === 'pinned') filtered = messages.filter(m => m.pinned);
        else if (activeMbFilter === 'hidden') filtered = messages.filter(m => m.status === 'hidden');

        if (filtered.length === 0) {
            mbPostsContainer.innerHTML = `<div style="text-align: center; color: var(--text-secondary); padding: 30px; font-style: italic;">No posts found under the "${activeMbFilter}" filter.</div>`;
            return;
        }

        const catMap = {};
        (mbAdminData.categories || []).forEach(c => catMap[c.id] = c);

        mbPostsContainer.innerHTML = filtered.map(msg => {
            const cat = catMap[msg.category_id] || { name: 'General', color: '#38bdf8', icon: 'fa-solid fa-comment' };
            const timeStr = new Date(msg.timestamp).toLocaleString();
            const isPending = msg.status === 'pending';
            const isHidden = msg.status === 'hidden';
            const isPinned = !!msg.pinned;

            let statusBadge = `<span style="background: #10b98122; border: 1px solid #10b981; color: #10b981; padding: 2px 7px; border-radius: 4px; font-size: 0.75rem; font-weight: bold;">Approved</span>`;
            if (isPending) statusBadge = `<span style="background: #ef444422; border: 1px solid #ef4444; color: #ef4444; padding: 2px 7px; border-radius: 4px; font-size: 0.75rem; font-weight: bold;">Pending Approval</span>`;
            if (isHidden) statusBadge = `<span style="background: #64748b22; border: 1px solid #64748b; color: #64748b; padding: 2px 7px; border-radius: 4px; font-size: 0.75rem; font-weight: bold;">Hidden</span>`;

            return `
                <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-left: 4px solid ${cat.color}; border-radius: 8px; padding: 14px 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span style="color: ${cat.color}; font-size: 0.8rem; font-weight: bold; background: ${cat.color}15; padding: 2px 8px; border-radius: 6px;">
                                <i class="${cat.icon}"></i> ${cat.name}
                            </span>
                            <strong style="color: #fff;">${msg.is_anonymous ? 'Anonymous' : escapeHtml(msg.author)}</strong>
                            <span style="color: var(--text-secondary); font-size: 0.8rem;">(${escapeHtml(msg.shift || 'Plant')})</span>
                            ${statusBadge}
                            ${isPinned ? '<span style="color: #38bdf8; font-size: 0.75rem; font-weight: bold;"><i class="fa-solid fa-thumbtack"></i> Pinned</span>' : ''}
                        </div>
                        <span style="color: var(--text-secondary); font-size: 0.8rem; opacity: 0.8;">${timeStr}</span>
                    </div>

                    <p style="color: #f1f5f9; font-size: 0.95rem; margin: 0 0 12px 0; line-height: 1.45; word-break: break-word;">
                        ${escapeHtml(msg.text)}
                    </p>

                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px;">
                        <div style="font-size: 0.8rem; color: var(--text-secondary);">
                            Reactions: 👍 ${msg.reactions?.thumbsup || 0} • ❤️ ${msg.reactions?.heart || 0} • 🔥 ${msg.reactions?.fire || 0}
                        </div>
                        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                            ${isPending ? `<button class="btn btn-sm btn-success btn-mod-action" data-id="${msg.id}" data-action="approve"><i class="fa-solid fa-check"></i> Approve</button>` : ''}
                            <button class="btn btn-sm ${isPinned ? 'btn-warning' : 'btn-secondary'} btn-mod-action" data-id="${msg.id}" data-action="pin">
                                <i class="fa-solid fa-thumbtack"></i> ${isPinned ? 'Unpin' : 'Pin'}
                            </button>
                            <button class="btn btn-sm ${isHidden ? 'btn-info' : 'btn-secondary'} btn-mod-action" data-id="${msg.id}" data-action="${isHidden ? 'approve' : 'hide'}">
                                <i class="fa-solid ${isHidden ? 'fa-eye' : 'fa-eye-slash'}"></i> ${isHidden ? 'Show' : 'Hide'}
                            </button>
                            <button class="btn btn-sm btn-danger btn-mod-action" data-id="${msg.id}" data-action="delete">
                                <i class="fa-solid fa-trash"></i> Delete
                            </button>
                            ${!msg.is_anonymous ? `<button class="btn btn-sm btn-secondary btn-reset-pin" data-name="${msg.author}" title="Reset this user's 4-digit PIN"><i class="fa-solid fa-key"></i> Reset PIN</button>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        document.querySelectorAll('.btn-mod-action').forEach(btn => {
            btn.addEventListener('click', () => {
                const messageId = btn.getAttribute('data-id');
                const action = btn.getAttribute('data-action');
                if (action === 'delete' && !confirm('Are you sure you want to permanently delete this message?')) return;

                fetch('/api/message-board/admin/moderate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message_id: messageId, action })
                })
                .then(r => r.json())
                .then(() => loadMessageBoardAdmin());
            });
        });

        document.querySelectorAll('.btn-reset-pin').forEach(btn => {
            btn.addEventListener('click', () => {
                const empName = btn.getAttribute('data-name');
                if (confirm(`Reset 4-digit PIN for "${empName}"? They will be able to create a new PIN on their next post.`)) {
                    fetch('/api/message-board/admin/reset-pin', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ employee_name: empName })
                    })
                    .then(r => r.json())
                    .then(d => {
                        alert(d.message || 'PIN reset successfully');
                    });
                }
            });
        });
    }

    function saveMbSettingsDirect() {
        const payload = {
            enabled: chkMbEnabled ? chkMbEnabled.checked : true,
            require_approval: chkMbApproval ? chkMbApproval.checked : false,
            categories: mbAdminData.categories || []
        };

        fetch('/api/message-board/admin/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(r => r.json())
        .then(data => {
            if (mbSettingsStatus) {
                mbSettingsStatus.style.display = 'block';
                mbSettingsStatus.innerHTML = '<span style="color:var(--success)"><i class="fa-solid fa-check"></i> Message board settings saved!</span>';
                setTimeout(() => mbSettingsStatus.style.display = 'none', 3000);
            }
            loadMessageBoardAdmin();
        });
    }

    if (navMessageBoardBtn) {
        navMessageBoardBtn.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            navMessageBoardBtn.classList.add('active');
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            if (messageBoardView) messageBoardView.classList.add('active');
            currentScriptTitle.innerText = 'Live Message Board';
            loadMessageBoardAdmin();
        });
    }

    if (btnSaveMbSettings) {
        btnSaveMbSettings.addEventListener('click', () => saveMbSettingsDirect());
    }

    if (btnAddCategory) {
        btnAddCategory.addEventListener('click', () => {
            const name = newCatName ? newCatName.value.trim() : '';
            if (!name) return alert('Please enter a category name.');
            const icon = newCatIcon ? newCatIcon.value.trim() : 'fa-solid fa-tag';
            const color = newCatColor ? newCatColor.value : '#38bdf8';
            const id = name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');

            if (!mbAdminData.categories) mbAdminData.categories = [];
            mbAdminData.categories.push({ id, name, icon, color });
            if (newCatName) newCatName.value = '';
            saveMbSettingsDirect();
        });
    }

    document.querySelectorAll('.mb-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.mb-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeMbFilter = btn.getAttribute('data-filter');
            renderAdminPosts();
        });
    });

    function renderSidebar() {
        const dynamicContainer = document.getElementById('dynamic-scripts');
        dynamicContainer.innerHTML = '';
        scriptsConfig.forEach(script => {
            const btn = document.createElement('button');
            btn.className = 'nav-item';
            btn.setAttribute('data-script', script.id);
            
            // Clean up the name if it has "01. " prefixes from the old script server
            const cleanName = script.name.replace(/^\d+\.\s*/, '');
            
            btn.innerHTML = `<i class="fa-solid fa-code"></i> ${cleanName}`;
            btn.addEventListener('click', () => loadScript(script, btn));
            dynamicContainer.appendChild(btn);
        });
        setupHoverLinks();
    }

    function setupHoverLinks() {
        const navItems = document.querySelectorAll('.nav-item');
        const infoCards = document.querySelectorAll('.info-card');

        navItems.forEach(item => {
            item.addEventListener('mouseenter', () => {
                const scriptId = item.getAttribute('data-script');
                if (!scriptId) return;
                const card = document.querySelector(`.info-card[data-script="${scriptId}"]`);
                if (card) card.classList.add('highlighted-card');
            });
            item.addEventListener('mouseleave', () => {
                infoCards.forEach(c => c.classList.remove('highlighted-card'));
            });
        });

        infoCards.forEach(card => {
            card.addEventListener('click', () => {
                const scriptId = card.getAttribute('data-script');
                if (!scriptId) return;
                const navItem = document.querySelector(`.nav-item[data-script="${scriptId}"]`);
                if (navItem) navItem.click();
            });
            card.addEventListener('mouseenter', () => {
                const scriptId = card.getAttribute('data-script');
                if (!scriptId) return;
                const navItem = document.querySelector(`.nav-item[data-script="${scriptId}"]`);
                if (navItem) navItem.classList.add('highlighted-nav');
            });
            card.addEventListener('mouseleave', () => {
                navItems.forEach(n => n.classList.remove('highlighted-nav'));
            });
        });
    }

    function loadScript(script, btnElement) {
        // Update active states
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        btnElement.classList.add('active');
        
        activeScript = script;
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        scriptView.classList.add('active');

        const cleanName = script.name.replace(/^\d+\.\s*/, '');
        currentScriptTitle.innerText = cleanName;

        // Inject matching info card into the script view
        const placeholder = document.getElementById('script-info-placeholder');
        placeholder.innerHTML = '';
        const sourceCard = document.querySelector(`.info-card[data-script="${script.id}"]`);
        if (sourceCard) {
            const clone = sourceCard.cloneNode(true);
            clone.classList.remove('highlighted-card');
            clone.style.marginBottom = '0';
            placeholder.appendChild(clone);
        }

        // Generate form
        formInputs.innerHTML = '';
        if (script.parameters && script.parameters.length > 0) {
            script.parameters.forEach(param => {
                const group = document.createElement('div');
                group.className = 'input-group';
                
                const label = document.createElement('label');
                label.innerText = param.name;
                if (param.required) label.innerText += ' *';
                group.appendChild(label);

                let input;
                if (param.type === 'list') {
                    input = document.createElement('select');
                    input.name = param.name;
                    param.values.forEach(val => {
                        const opt = document.createElement('option');
                        opt.value = val;
                        opt.innerText = val;
                        input.appendChild(opt);
                    });
                } else if (param.type === 'file_upload') {
                    input = document.createElement('input');
                    input.type = 'file';
                    input.name = param.name;
                } else {
                    input = document.createElement('input');
                    input.type = 'text';
                    input.name = param.name;
                    if (param.description) input.placeholder = param.description;
                }

                if (param.required) input.required = true;
                group.appendChild(input);
                formInputs.appendChild(group);

                // Auto pre-populate tracker values for update_blend and update_osha
                if (script.id === 'update_blend' || script.id.includes('blend')) {
                    fetch('/api/trackers')
                        .then(r => r.json())
                        .then(trackers => {
                            if (param.name.toLowerCase().includes('value') || param.name.toLowerCase().includes('recipe')) {
                                const currentVal = trackers.production_tracker_value || trackers.blend_recipe || '';
                                if (currentVal && !input.value) {
                                    input.value = currentVal;
                                    input.placeholder = `Current: ${currentVal}`;
                                }
                            } else if (param.name.toLowerCase().includes('label') || param.name.toLowerCase().includes('title')) {
                                const currentLabel = trackers.production_tracker_label || trackers.blend_recipe_label || 'Active Blend Recipe #';
                                if (currentLabel && !input.value) {
                                    input.value = currentLabel;
                                    input.placeholder = `Current: ${currentLabel}`;
                                }
                            }
                        })
                        .catch(() => {});
                } else if (script.id === 'update_osha' && param.name.toLowerCase().includes('date')) {
                    fetch('/api/trackers')
                        .then(r => r.json())
                        .then(trackers => {
                            if (trackers.last_incident_date && !input.value) {
                                input.value = trackers.last_incident_date;
                                input.placeholder = `Current: ${trackers.last_incident_date}`;
                            }
                        })
                        .catch(() => {});
                }
            });
        } else {
            formInputs.innerHTML = '<p style="color: var(--text-secondary); font-style: italic;">No parameters required for this script.</p>';
        }
    }

    scriptForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!activeScript) return;

        const formData = new FormData(scriptForm);
        loadingOverlay.classList.remove('hidden');

        fetch(`/api/execute/${activeScript.id}`, {
            method: 'POST',
            body: formData
        })
        .then(res => res.json())
        .then(data => {
            loadingOverlay.classList.add('hidden');
            
            const timestamp = new Date().toLocaleTimeString();
            let log = `\n[${timestamp}] Executed: ${activeScript.name}\n`;
            
            if (data.output) log += data.output + '\n';
            if (data.error) log += `<span class="error">${data.error}</span>\n`;
            if (data.success) {
                log += `<span style="color: var(--success);">✔ Script completed successfully.</span>\n`;
            } else {
                log += `<span class="error">✖ Script exited with code ${data.code}</span>\n`;
            }
            
            log += `----------------------------------------\n`;
            
            consoleOutput.innerHTML += log;
            consoleOutput.scrollTop = consoleOutput.scrollHeight;
        })
        .catch(err => {
            loadingOverlay.classList.add('hidden');
            consoleOutput.innerHTML += `\n<span class="error">System Error: Failed to contact server.</span>\n`;
        });
    });

    clearConsoleBtn.addEventListener('click', () => {
        consoleOutput.innerHTML = '';
    });
});
