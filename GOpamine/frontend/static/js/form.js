const rangeSlider = document.querySelector('.range-slider');
const budgetValue = document.querySelector('.budget-value');
const dropdownHeader = document.querySelector('.dropdown-header');
const dropdownContent = document.querySelector('.dropdown-content');
const addPreferenceBtn = document.querySelector('.add-preference');
const submitBtn = document.querySelector('.submit-btn');
const addDestinationBtn = document.getElementById('add-destination-btn');
const destinationsList = document.querySelector('.destinations-list');
const API_BASE = `${window.location.origin}/api`;
const DEFAULT_VEHICLE = {
    type: 'car',
    speed: 45,
    name: 'Ô tô',
    icon: '🚗'
};
let cachedPlaces = null;
const PLACE_DATALIST_ID = 'places-list';

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
            <input type="text" placeholder="Tìm kiếm" class="destination-input" list="${PLACE_DATALIST_ID}" autocomplete="off">
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

function normalizeText(value) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

async function loadPlaces() {
    if (cachedPlaces) return cachedPlaces;
    
    const response = await fetch(`${API_BASE}/places`);
    const result = await response.json();
    
    if (!result.success) {
        throw new Error(result.error || 'Không thể tải danh sách địa điểm');
    }
    
    cachedPlaces = result.data;
    return cachedPlaces;
}

async function resolvePlaceByInput(inputValue) {
    if (!inputValue) return null;
    
    const numericId = parseInt(inputValue, 10);
    if (!Number.isNaN(numericId)) {
        const places = await loadPlaces();
        return places.find(place => place.id === numericId) || null;
    }
    
    const normalizedTarget = normalizeText(inputValue);
    const places = await loadPlaces();
    
    return (
        places.find(place => normalizeText(place.name) === normalizedTarget) ||
        places.find(place => normalizeText(place.name).includes(normalizedTarget)) ||
        null
    );
}

async function requestAStarRoute(startPlace, endPlace, vehicle = DEFAULT_VEHICLE) {
    const response = await fetch(`${API_BASE}/find-route`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            start_id: startPlace.id,
            end_id: endPlace.id,
            vehicle_type: vehicle.type,
            vehicle_speed: vehicle.speed
        })
    });
    
    const result = await response.json();
    if (!result.success) {
        throw new Error(result.error || 'Không tìm được tuyến đường phù hợp');
    }
    
    return result.data;
}

function persistRouteSelection(routeData, startPlace, endPlace, vehicle) {
    const payload = {
        timestamp: Date.now(),
        start_place: startPlace,
        end_place: endPlace,
        route_coordinates: routeData.route_coordinates,
        waypoints: routeData.waypoints,
        distance_km: routeData.distance_km,
        duration_min: routeData.duration_min,
        total_waypoints: routeData.total_waypoints,
        vehicle
    };
    
    localStorage.setItem('selectedRoute', JSON.stringify(payload));
}

async function tryCreateSession() {
    try {
        const response = await fetch(`${API_BASE}/session`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`status ${response.status}`);
        }

        const data = await response.json();
        if (data?.session_id) {
            localStorage.setItem('sessionId', data.session_id);
            return data.session_id;
        }
    } catch (error) {
        console.warn('Không thể tạo session (bỏ qua bước này):', error);
    }
    return null;
}

async function trySubmitFormData(sessionId, formData) {
    if (!sessionId) {
        return false;
    }

    try {
        const response = await fetch(`${API_BASE}/form`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                session_id: sessionId,
                form_data: formData
            })
        });

        if (!response.ok) {
            throw new Error(`status ${response.status}`);
        }

        await response.json();
        return true;
    } catch (error) {
        console.warn('Không thể gửi dữ liệu form (bỏ qua bước này):', error);
        return false;
    }
}

async function initPlaceSuggestions() {
    try {
        const places = await loadPlaces();
        const datalist = document.getElementById(PLACE_DATALIST_ID);
        if (!datalist) return;
        
        datalist.innerHTML = places
            .map(place => `<option value="${place.name}"></option>`)
            .join('');
    } catch (error) {
        console.error('Không thể tải gợi ý địa điểm:', error);
    }
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
initPlaceSuggestions();

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
        
        // 3. Lấy hoặc tạo session ID (nếu API chatbot đang chạy)
        let sessionId = localStorage.getItem('sessionId');
        if (!sessionId) {
            console.log('🆕 Tạo session mới (nếu API có sẵn)...');
            sessionId = await tryCreateSession();
        } else {
            console.log('♻️ Sử dụng session có sẵn:', sessionId);
        }
        
        if (sessionId) {
            console.log('📤 Gửi form data đến backend (nếu chatbot API hoạt động)...');
            await trySubmitFormData(sessionId, formData);
        }
        
        // 5. Gọi A* backend để lấy lộ trình
        const primaryDestination = destinations[0];
        const startPlace = await resolvePlaceByInput(formData.origin);
        const endPlace = await resolvePlaceByInput(primaryDestination);
        
        if (!startPlace || !endPlace) {
            throw new Error('Không tìm thấy địa điểm phù hợp trong cơ sở dữ liệu');
        }
        
        console.log('🧭 Đang tính toán đường đi với A* ...');
        const routeData = await requestAStarRoute(startPlace, endPlace, DEFAULT_VEHICLE);
        persistRouteSelection(routeData, startPlace, endPlace, DEFAULT_VEHICLE);
        
        // 6. Lưu form data để chatbot có thể tự động tạo prompt
        localStorage.setItem('pendingFormData', JSON.stringify(formData));
        
        // 7. Chuyển sang trang chatbot để tư vấn
        console.log('🤖 Chuyển sang chatbot...');
        window.location.href = '/chatbot';
        
    } catch (error) {
        console.error('❌ Error:', error);
        alert('Có lỗi xảy ra: ' + error.message + '\nVui lòng thử lại!');
        
        // Reset button
        submitBtn.disabled = false;
        submitBtn.textContent = 'Hoàn tất';
    }
});