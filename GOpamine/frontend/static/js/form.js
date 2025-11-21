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

    // Khởi tạo sự kiện cho item mới
    initDestinationItem(newDestination);

    
    // Cập nhật hiển thị nút xóa
    updateDestinationVisibility();
    
    // Focus vào input mới
    newDestination.querySelector('.destination-input').focus();
});

// Hàm cập nhật hiển thị nút xóa
function updateDestinationVisibility() {
    const items = destinationsList.querySelectorAll('.destination-item');
    items.forEach((item) => {
        const removeBtn = item.querySelector('.remove-destination-btn');
        if (removeBtn) {
            removeBtn.style.display = 'flex'; // luôn hiển thị
        }
    });
}

// Hàm khởi tạo 1 destination-item: thêm sự kiện xóa + drag & drop
function initDestinationItem(item) {
    if (!item) return;

    // Sự kiện xóa
    const removeBtn = item.querySelector('.remove-destination-btn');
    if (removeBtn) {
        removeBtn.onclick = () => {
            item.remove();
            updateDestinationVisibility();
        };
    }

    // Sự kiện drag & drop
    addDragAndDropEvents(item);
}

// Biến để lưu item đang được kéo
let draggedItem = null;

// Hàm thêm sự kiện drag & drop
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

// Khởi tạo sự kiện cho item đầu tiên
const firstDestination = destinationsList.querySelector('.destination-item');
initDestinationItem(firstDestination);

// Cập nhật hiển thị ban đầu
updateDestinationVisibility();

// Thêm ưu tiên mới
addPreferenceBtn.addEventListener('click', () => {
    const preferenceName = prompt('Nhập tên ưu tiên mới:');
    
    if (preferenceName && preferenceName.trim() !== '') {
        // Tạo item mới
        const newItem = document.createElement('div');
        newItem.className = 'checkbox-item';
        newItem.innerHTML = `
            <span>${preferenceName.trim()}</span>
            <input type="checkbox">
        `;
        
        // Thêm vào trước nút "Thêm"
        dropdownContent.insertBefore(newItem, addPreferenceBtn);
    }
});

// Chuyển sang trang chatbot khi bấm Hoàn tất
submitBtn.addEventListener('click', async () => {
    // Thu thập tất cả điểm đến
    const destinationInputs = document.querySelectorAll('.destination-input');
    const destinations = Array.from(destinationInputs)
        .map(input => input.value)
        .filter(value => value.trim() !== '');
    
    // Thu thập dữ liệu form
    const formData = {
        origin: document.getElementById('origin-input').value,
        destinations: destinations, // Mảng các điểm đến
        budget: rangeSlider.value,
        passengers: document.querySelector('input[placeholder="Số hành khách"]').value,
        age: document.querySelector('input[placeholder="Tuổi"]').value,
        preferences: Array.from(document.querySelectorAll('.checkbox-item input:checked'))
            .map(cb => cb.parentElement.querySelector('span').textContent)
    };

    try {
        // Lấy session ID từ localStorage (hoặc tạo mới)
        let sessionId = localStorage.getItem('sessionId');
        
        if (!sessionId) {
            // Tạo session mới
            const response = await fetch('http://localhost:5000/api/session', {
                method: 'POST'
            });
            const data = await response.json();
            sessionId = data.session_id;
            localStorage.setItem('sessionId', sessionId);
        }

        // Gửi form data đến backend
        await fetch('http://localhost:5000/api/form', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                session_id: sessionId,
                form_data: formData
            })
        });

        // Chuyển sang trang chatbot
        window.location.href = 'chatbot.html';
    } catch (error) {
        console.error('Error submitting form:', error);
        alert('Có lỗi xảy ra. Vui lòng thử lại!');
    }
});