const rangeSlider = document.querySelector('.range-slider');
const budgetValue = document.querySelector('.budget-value');
const dropdownHeader = document.querySelector('.dropdown-header');
const dropdownContent = document.querySelector('.dropdown-content');
const addPreferenceBtn = document.querySelector('.add-preference');
const submitBtn = document.querySelector('.submit-btn');
const addDestinationBtn = document.getElementById('add-destination-btn');
const destinationsList = document.querySelector('.destinations-list');

// Hàm format số tiền
function formatCurrency(value) {
    return 'đ0-' + value.toLocaleString('vi-VN');
}

// Cập nhật giá trị khi kéo slider
rangeSlider.addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    budgetValue.textContent = formatCurrency(value);
});

// Set giá trị ban đầu
budgetValue.textContent = formatCurrency(parseInt(rangeSlider.value));

// Toggle dropdown (thu/mở)
dropdownHeader.addEventListener('click', () => {
    dropdownContent.classList.toggle('hidden');
    dropdownHeader.classList.toggle('collapsed');
});

// Thêm điểm đến mới
addDestinationBtn.addEventListener('click', () => {
    const newDestination = document.createElement('div');
    newDestination.className = 'destination-item';
    newDestination.draggable = true;
    newDestination.innerHTML = `
        <div class="destination-input-wrapper">
            <input type="text" placeholder="Tìm kiếm" class="destination-input">
            <div class="destination-controls">
                <div class="drag-handle">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
                <button class="remove-destination-btn" title="Xóa điểm đến">×</button>
            </div>
        </div>
    `;
    
    destinationsList.appendChild(newDestination);
    initDestinationItem(newDestination);
    updateDestinationVisibility();
    newDestination.querySelector('.destination-input').focus();
});

// Hàm cập nhật hiển thị nút xóa
function updateDestinationVisibility() {
    const items = destinationsList.querySelectorAll('.destination-item');
    items.forEach((item) => {
        const removeBtn = item.querySelector('.remove-destination-btn');
        if (removeBtn) {
            removeBtn.style.display = 'flex';
        }
    });
}

// Hàm khởi tạo 1 destination-item
function initDestinationItem(item) {
    if (!item) return;

    const removeBtn = item.querySelector('.remove-destination-btn');
    if (removeBtn) {
        removeBtn.onclick = () => {
            item.remove();
            updateDestinationVisibility();
        };
    }

    addDragAndDropEvents(item);
}

// Drag & drop
let draggedItem = null;

function addDragAndDropEvents(item) {
    item.addEventListener('dragstart', handleDragStart);
    item.addEventListener('dragover', handleDragOver);
    item.addEventListener('drop', handleDrop);
    item.addEventListener('dragend', handleDragEnd);
}

function handleDragStart(e) {
    draggedItem = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    const afterElement = getDragAfterElement(destinationsList, e.clientY);
    if (afterElement == null) {
        destinationsList.appendChild(draggedItem);
    } else {
        destinationsList.insertBefore(draggedItem, afterElement);
    }
}

function handleDrop(e) {
    e.preventDefault();
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    draggedItem = null;
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.destination-item:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// Khởi tạo item đầu tiên
const firstDestination = destinationsList.querySelector('.destination-item');
initDestinationItem(firstDestination);
updateDestinationVisibility();

// Thêm ưu tiên mới
addPreferenceBtn.addEventListener('click', () => {
    const preferenceName = prompt('Nhập tên ưu tiên mới:');
    
    if (preferenceName && preferenceName.trim() !== '') {
        const newItem = document.createElement('div');
        newItem.className = 'checkbox-item';
        newItem.innerHTML = `
            <span>${preferenceName.trim()}</span>
            <input type="checkbox">
        `;
        dropdownContent.insertBefore(newItem, addPreferenceBtn);
    }
});

// ========================================
// PHẦN QUAN TRỌNG: Submit form và chuyển trang
// ========================================

submitBtn.addEventListener('click', async () => {
    // Hiển thị loading (optional)
    submitBtn.disabled = true;
    submitBtn.textContent = 'Đang xử lý...';
    
    try {
        // 1. Thu thập tất cả điểm đến
        const destinationInputs = document.querySelectorAll('.destination-input');
        const destinations = Array.from(destinationInputs)
            .map(input => input.value.trim())
            .filter(value => value !== '');
        
        // 2. Thu thập dữ liệu form
        const formData = {
            origin: document.getElementById('origin-input').value.trim(),
            destinations: destinations,
            budget: rangeSlider.value,
            passengers: document.querySelector('input[placeholder="Số hành khách"]').value.trim(),
            age: document.querySelector('input[placeholder="Tuổi"]')?.value.trim() || '',
            preferences: Array.from(document.querySelectorAll('.checkbox-item input:checked'))
                .map(cb => cb.parentElement.querySelector('span').textContent)
        };
        
        console.log('📋 Form Data:', formData);
        
        // Validate dữ liệu cơ bản
        if (!formData.origin) {
            alert('Vui lòng nhập điểm xuất phát!');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Hoàn tất';
            return;
        }
        
        if (destinations.length === 0) {
            alert('Vui lòng nhập ít nhất một điểm đến!');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Hoàn tất';
            return;
        }
        
        // 3. Lấy hoặc tạo session ID
        let sessionId = localStorage.getItem('sessionId');
        
        if (!sessionId) {
            console.log('🆕 Tạo session mới...');
            const response = await fetch('http://localhost:5000/api/session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error('Không thể tạo session');
            }
            
            const data = await response.json();
            sessionId = data.session_id;
            localStorage.setItem('sessionId', sessionId);
            console.log('✅ Session created:', sessionId);
        } else {
            console.log('♻️ Sử dụng session có sẵn:', sessionId);
        }
        
        // 4. Gửi form data đến backend
        console.log('📤 Gửi form data đến backend...');
        const submitResponse = await fetch('http://localhost:5000/api/form', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                session_id: sessionId,
                form_data: formData
            })
        });
        
        if (!submitResponse.ok) {
            throw new Error('Không thể gửi dữ liệu form');
        }
        
        const result = await submitResponse.json();
        console.log('✅ Form submitted:', result);
        
        // 5. Chuyển sang trang chatbot
        console.log('🔄 Chuyển sang chatbot...');
        window.location.href = 'chatbot.html';
        
    } catch (error) {
        console.error('❌ Error:', error);
        alert('Có lỗi xảy ra: ' + error.message + '\nVui lòng thử lại!');
        
        // Reset button
        submitBtn.disabled = false;
        submitBtn.textContent = 'Hoàn tất';
    }
});