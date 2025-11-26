// =============================================================================
// 1. KHỞI TẠO & UI (GIỮ NGUYÊN TỪ CODE GỐC)
// =============================================================================
const rangeSlider = document.querySelector('.range-slider');
const budgetValue = document.querySelector('.budget-value');
const dropdownHeader = document.querySelector('.dropdown-header');
const dropdownContent = document.querySelector('.dropdown-content');
const addPreferenceBtn = document.querySelector('.add-preference');
const submitBtn = document.querySelector('.submit-btn');
const addDestinationBtn = document.getElementById('add-destination-btn');
const destinationsList = document.querySelector('.destinations-list');
const API_BASE = `${window.location.origin}/api`; // Code mới cần cái này
const DEFAULT_VEHICLE = { type: 'car', speed: 45, name: 'Ô tô', icon: '🚗' };
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
budgetValue.textContent = formatCurrency(parseInt(rangeSlider.value));

// Toggle dropdown
dropdownHeader.addEventListener('click', () => {
    dropdownContent.classList.toggle('hidden');
    dropdownHeader.classList.toggle('collapsed');
});

// --- QUẢN LÝ ĐIỂM ĐẾN (DRAG & DROP, THÊM, XÓA) ---
// (Giữ nguyên logic cũ để không mất tính năng hiển thị)

addDestinationBtn.addEventListener('click', () => {
    const newDestination = document.createElement('div');
    newDestination.className = 'destination-item';
    newDestination.draggable = true;
    newDestination.innerHTML = `
        <div class="destination-input-wrapper">
            <input type="text" placeholder="Tìm kiếm" class="destination-input" list="${PLACE_DATALIST_ID}" autocomplete="off">
            <div class="destination-controls">
                <div class="drag-handle"><span></span><span></span><span></span></div>
                <button class="remove-destination-btn" title="Xóa điểm đến">×</button>
            </div>
        </div>
    `;
    destinationsList.appendChild(newDestination);
    initDestinationItem(newDestination);
    updateDestinationVisibility();
    newDestination.querySelector('.destination-input').focus();
});

function updateDestinationVisibility() {
    const items = destinationsList.querySelectorAll('.destination-item');
    items.forEach((item) => {
        const removeBtn = item.querySelector('.remove-destination-btn');
        if (removeBtn) removeBtn.style.display = 'flex';
    });
}

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

// Drag & Drop Logic (Giữ nguyên)
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
    if (afterElement == null) destinationsList.appendChild(draggedItem);
    else destinationsList.insertBefore(draggedItem, afterElement);
}
function handleDrop(e) { e.preventDefault(); }
function handleDragEnd(e) {
    this.classList.remove('dragging');
    draggedItem = null;
}
function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.destination-item:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) return { offset: offset, element: child };
        else return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// --- XỬ LÝ DỮ LIỆU & API ---

function normalizeText(value) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

async function loadPlaces() {
    if (cachedPlaces) return cachedPlaces;
    const response = await fetch(`${API_BASE}/places`);
    const result = await response.json();
    if (!result.success) throw new Error(result.error || 'Lỗi tải địa điểm');
    cachedPlaces = result.data;
    return cachedPlaces;
}

async function resolvePlaceByInput(inputValue) {
    if (!inputValue) return null;
    const places = await loadPlaces();
    // Logic tìm kiếm thông minh (ID hoặc Tên)
    const numericId = parseInt(inputValue, 10);
    if (!Number.isNaN(numericId)) return places.find(p => p.id === numericId) || null;
    
    const normalizedTarget = normalizeText(inputValue);
    return places.find(p => normalizeText(p.name) === normalizedTarget) ||
           places.find(p => normalizeText(p.name).includes(normalizedTarget)) || null;
}

async function initPlaceSuggestions() {
    try {
        const places = await loadPlaces();
        const datalist = document.getElementById(PLACE_DATALIST_ID);
        if (!datalist) return;
        datalist.innerHTML = places.map(p => `<option value="${p.name}"></option>`).join('');
    } catch (error) { console.error('Lỗi gợi ý:', error); }
}

// Khởi tạo ban đầu
const firstDestination = destinationsList.querySelector('.destination-item');
initDestinationItem(firstDestination);
updateDestinationVisibility();
initPlaceSuggestions(); // Load danh sách gợi ý

// Thêm ưu tiên (Preferences)
addPreferenceBtn.addEventListener('click', () => {
    const preferenceName = prompt('Nhập tên ưu tiên mới:');
    if (preferenceName && preferenceName.trim() !== '') {
        const newItem = document.createElement('div');
        newItem.className = 'checkbox-item';
        newItem.innerHTML = `<span>${preferenceName.trim()}</span><input type="checkbox">`;
        dropdownContent.insertBefore(newItem, addPreferenceBtn);
    }
});

// =============================================================================
// 2. XỬ LÝ SUBMIT (PHẦN QUAN TRỌNG ĐÃ CẬP NHẬT)
// =============================================================================

// Hàm tính khoảng cách (Haversine) - Để dự phòng nếu A* không trả về
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function persistRouteSelection(routeData, startPlace, endPlace, vehicle) {
    const payload = {
        timestamp: Date.now(),
        start_place: startPlace,
        end_place: endPlace,
        route_coordinates: routeData.route_coordinates,
        waypoints: routeData.waypoints,
        distance_km: routeData.distance_km, // Quan trọng: cần số này để tính tiền
        duration_min: routeData.duration_min,
        vehicle
    };
    localStorage.setItem('selectedRoute', JSON.stringify(payload));
}

submitBtn.addEventListener('click', async () => {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Đang xử lý...';
    
    try {
        // 1. Thu thập dữ liệu
        const destinationInputs = document.querySelectorAll('.destination-input');
        const destinations = Array.from(destinationInputs)
            .map(input => input.value.trim()).filter(v => v !== '');
        
        const formData = {
            origin: document.getElementById('origin-input').value.trim(),
            destinations: destinations,
            budget: rangeSlider.value,
            passengers: document.querySelector('input[placeholder="Số hành khách"]').value.trim(),
            preferences: Array.from(document.querySelectorAll('.checkbox-item input:checked'))
                .map(cb => cb.parentElement.querySelector('span').textContent)
        };
        
        if (!formData.origin || destinations.length === 0) {
            throw new Error('Vui lòng nhập điểm đi và điểm đến!');
        }

        // 2. LƯU DATA VÀO LOCALSTORAGE (Để map_trans.js dùng gọi API Pricing)
        localStorage.setItem('formData', JSON.stringify(formData));
        console.log('💾 Đã lưu formData:', formData);

        // 3. Tính toán lộ trình (A*)
        const startPlace = await resolvePlaceByInput(formData.origin);
        const endPlace = await resolvePlaceByInput(destinations[0]);
        
        if (!startPlace || !endPlace) throw new Error('Không tìm thấy địa điểm trong CSDL');

        // Gọi API tìm đường
        const routeResponse = await fetch(`${API_BASE}/find-route`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                start_id: startPlace.id,
                end_id: endPlace.id,
                vehicle_type: DEFAULT_VEHICLE.type,
                vehicle_speed: DEFAULT_VEHICLE.speed
            })
        });
        
        const routeResult = await routeResponse.json();
        if (!routeResult.success) throw new Error(routeResult.error);
        
        const routeData = routeResult.data;

        // Tự tính khoảng cách nếu API A* chưa trả về (để tính tiền)
        if (!routeData.distance_km) {
            routeData.distance_km = calculateDistance(
                startPlace.lat || startPlace.latitude, 
                startPlace.lon || startPlace.longitude,
                endPlace.lat || endPlace.latitude, 
                endPlace.lon || endPlace.longitude
            );
        }

        // 4. Lưu lộ trình và chuyển trang
        persistRouteSelection(routeData, startPlace, endPlace, DEFAULT_VEHICLE);
        window.location.href = 'map_trans';

    } catch (error) {
        console.error(error);
        alert(error.message);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Hoàn tất';
    }
});