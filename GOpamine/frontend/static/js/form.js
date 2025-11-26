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

// Cấu hình Nominatim API
const NOMINATIM_CONFIG = {
    baseUrl: 'https://nominatim.openstreetmap.org/search',
    // Giới hạn tìm kiếm trong khu vực TP.HCM và lân cận
    viewbox: '106.3,10.35,107.0,11.2', // [minLon,minLat,maxLon,maxLat]
    bounded: 1, // Chỉ tìm trong viewbox
    limit: 8,
    format: 'json',
    addressdetails: 1
};

let debounceTimer = null;
let cachedPlaces = null; // Vẫn giữ cache cho database cũ (nếu cần)

// ===== PHẦN MỚI: TÌM KIẾM VỚI NOMINATIM =====

/**
 * Tìm kiếm địa điểm qua Nominatim API
 */
async function searchPlacesNominatim(query) {
    if (!query || query.length < 3) return [];
    
    try {
        const params = new URLSearchParams({
            q: query,
            format: NOMINATIM_CONFIG.format,
            addressdetails: NOMINATIM_CONFIG.addressdetails,
            limit: NOMINATIM_CONFIG.limit,
            viewbox: NOMINATIM_CONFIG.viewbox,
            bounded: NOMINATIM_CONFIG.bounded,
            'accept-language': 'vi'
        });
        
        const response = await fetch(`${NOMINATIM_CONFIG.baseUrl}?${params}`, {
            headers: {
                'User-Agent': 'RouteOptimizer/1.0' // Bắt buộc theo quy định Nominatim
            }
        });
        
        if (!response.ok) throw new Error('Nominatim API error');
        
        const results = await response.json();
        
        // Chuyển đổi format Nominatim sang format app của bạn
        return results.map(place => ({
            id: place.place_id,
            osm_id: place.osm_id,
            name: place.display_name,
            lat: parseFloat(place.lat),
            lon: parseFloat(place.lon),
            type: place.type,
            category: place.class,
            address: place.address,
            source: 'nominatim' // Đánh dấu nguồn
        }));
    } catch (error) {
        console.error('Lỗi tìm kiếm Nominatim:', error);
        return [];
    }
}

/**
 * Hiển thị gợi ý tự động (autocomplete)
 */
function setupAutocomplete(inputElement) {
    let suggestionsDiv = inputElement.nextElementSibling;
    
    // Tạo div gợi ý nếu chưa có
    if (!suggestionsDiv || !suggestionsDiv.classList.contains('autocomplete-suggestions')) {
        suggestionsDiv = document.createElement('div');
        suggestionsDiv.className = 'autocomplete-suggestions';
        inputElement.parentNode.insertBefore(suggestionsDiv, inputElement.nextSibling);
    }
    
    inputElement.addEventListener('input', async (e) => {
        const query = e.target.value.trim();
        
        // Clear debounce cũ
        clearTimeout(debounceTimer);
        
        if (query.length < 3) {
            suggestionsDiv.innerHTML = '';
            suggestionsDiv.style.display = 'none';
            return;
        }
        
        // Debounce 300ms để tránh gọi API liên tục
        debounceTimer = setTimeout(async () => {
            const places = await searchPlacesNominatim(query);
            displaySuggestions(suggestionsDiv, places, inputElement);
        }, 300);
    });
    
    // Ẩn gợi ý khi click ra ngoài
    document.addEventListener('click', (e) => {
        if (!inputElement.contains(e.target) && !suggestionsDiv.contains(e.target)) {
            suggestionsDiv.style.display = 'none';
        }
    });
}

/**
 * Hiển thị danh sách gợi ý
 */
function displaySuggestions(container, places, inputElement) {
    if (places.length === 0) {
        container.innerHTML = '<div class="suggestion-item no-results">Không tìm thấy kết quả</div>';
        container.style.display = 'block';
        return;
    }
    
    container.innerHTML = places.map(place => {
        // Tách địa chỉ ngắn gọn hơn
        const shortName = place.name.split(',').slice(0, 2).join(',');
        const icon = getPlaceIcon(place.type);
        
        return `
            <div class="suggestion-item" data-place='${JSON.stringify(place)}'>
                <span class="suggestion-icon">${icon}</span>
                <div class="suggestion-content">
                    <div class="suggestion-name">${shortName}</div>
                    <div class="suggestion-address">${place.type}</div>
                </div>
            </div>
        `;
    }).join('');
    
    container.style.display = 'block';
    
    // Xử lý click vào suggestion
    container.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
            const placeData = JSON.parse(item.dataset.place);
            inputElement.value = placeData.name.split(',').slice(0, 2).join(',');
            inputElement.dataset.placeData = JSON.stringify(placeData);
            container.style.display = 'none';
        });
    });
}

/**
 * Lấy icon theo loại địa điểm
 */
function getPlaceIcon(type) {
    const iconMap = {
        'cafe': '☕',
        'restaurant': '🍽️',
        'school': '🏫',
        'hospital': '🏥',
        'park': '🌳',
        'hotel': '🏨',
        'shop': '🛒',
        'mall': '🏬',
        'museum': '🏛️',
        'theatre': '🎭',
        'bus_stop': '🚏',
        'railway': '🚉',
        'airport': '✈️'
    };
    return iconMap[type] || '📍';
}

/**
 * Lấy thông tin địa điểm từ input (data attribute)
 */
function getPlaceFromInput(inputElement) {
    const placeData = inputElement.dataset.placeData;
    if (!placeData) return null;
    
    try {
        return JSON.parse(placeData);
    } catch (error) {
        console.error('Lỗi parse place data:', error);
        return null;
    }
}

// ===== FORMAT VÀ SLIDER =====

function formatCurrency(value) {
    return 'đ0-' + value.toLocaleString('vi-VN');
}

rangeSlider.addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    budgetValue.textContent = formatCurrency(value);
});

budgetValue.textContent = formatCurrency(parseInt(rangeSlider.value));

dropdownHeader.addEventListener('click', () => {
    dropdownContent.classList.toggle('hidden');
    dropdownHeader.classList.toggle('collapsed');
});

// ===== THÊM ĐIỂM ĐẾN =====

addDestinationBtn.addEventListener('click', () => {
    const newDestination = document.createElement('div');
    newDestination.className = 'destination-item';
    newDestination.draggable = true;
    newDestination.innerHTML = `
        <div class="destination-input-wrapper">
            <input type="text" placeholder="Tìm kiếm địa điểm" class="destination-input" autocomplete="off">
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
    
    const newInput = newDestination.querySelector('.destination-input');
    setupAutocomplete(newInput);
    newInput.focus();
});

function updateDestinationVisibility() {
    const items = destinationsList.querySelectorAll('.destination-item');
    items.forEach((item) => {
        const removeBtn = item.querySelector('.remove-destination-btn');
        if (removeBtn) {
            removeBtn.style.display = 'flex';
        }
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

// ===== DRAG & DROP =====

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

// ===== ƯU TIÊN =====

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

// ===== SUBMIT FORM =====

async function tryCreateSession() {
    try {
        const response = await fetch(`${API_BASE}/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) throw new Error(`status ${response.status}`);
        const data = await response.json();
        
        if (data?.session_id) {
            localStorage.setItem('sessionId', data.session_id);
            return data.session_id;
        }
    } catch (error) {
        console.warn('Không thể tạo session:', error);
    }
    return null;
}

async function requestRouteFromBackend(startPlace, endPlace, vehicle = DEFAULT_VEHICLE) {
    const response = await fetch(`${API_BASE}/find-route-osm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            start: { lat: startPlace.lat, lon: startPlace.lon, name: startPlace.name },
            end: { lat: endPlace.lat, lon: endPlace.lon, name: endPlace.name },
            vehicle_type: vehicle.type,
            vehicle_speed: vehicle.speed
        })
    });
    
    const result = await response.json();
    if (!result.success) {
        throw new Error(result.error || 'Không tìm được tuyến đường');
    }
    
    return result.data;
}

async function syncFormDataWithChatbot(sessionId, formData) {
    if (!sessionId) return;
    try {
        await fetch(`${API_BASE}/form`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                form_data: formData
            })
        });
    } catch (error) {
        console.warn('Không thể đồng bộ dữ liệu form tới chatbot:', error);
    }
}

submitBtn.addEventListener('click', async () => {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Đang xử lý...';
    
    try {
        // 1. Lấy điểm xuất phát
        const originInput = document.getElementById('origin-input');
        const startPlace = getPlaceFromInput(originInput);
        
        if (!startPlace) {
            alert('Vui lòng chọn điểm xuất phát từ danh sách gợi ý!');
            throw new Error('No origin selected');
        }
        
        // 2. Lấy điểm đến
        const destinationInputs = document.querySelectorAll('.destination-input');
        const destinations = Array.from(destinationInputs)
            .map(input => getPlaceFromInput(input))
            .filter(place => place !== null);
        
        if (destinations.length === 0) {
            alert('Vui lòng chọn ít nhất một điểm đến từ danh sách gợi ý!');
            throw new Error('No destinations selected');
        }
        
        // 3. Thu thập dữ liệu form
        const formData = {
            origin: {
                name: startPlace.name,
                lat: startPlace.lat,
                lon: startPlace.lon
            },
            destinations: destinations.map(d => ({
                name: d.name,
                lat: d.lat,
                lon: d.lon
            })),
            budget: rangeSlider.value,
            passengers: document.querySelector('input[placeholder="Số hành khách"]').value.trim(),
            preferences: Array.from(document.querySelectorAll('.checkbox-item input:checked'))
                .map(cb => cb.parentElement.querySelector('span').textContent)
        };
        
        console.log('📋 Form Data:', formData);
        
        // 4. Tạo session (nếu có API)
        let sessionId = localStorage.getItem('sessionId');
        if (!sessionId) {
            sessionId = await tryCreateSession();
        }
        await syncFormDataWithChatbot(sessionId, formData);
        
        // 5. Gọi backend để tính route (OSM routing)
        const primaryDestination = destinations[0];
        console.log('🧭 Đang tính toán đường đi...');
        
        const routeData = await requestRouteFromBackend(startPlace, primaryDestination, DEFAULT_VEHICLE);
        
        // 6. Lưu route vào localStorage
        const routePayload = {
            timestamp: Date.now(),
            start_place: startPlace,
            end_place: primaryDestination,
            route_coordinates: routeData.route_coordinates,
            waypoints: routeData.waypoints,
            distance_km: routeData.distance_km,
            duration_min: routeData.duration_min,
            vehicle: DEFAULT_VEHICLE
        };
        
        localStorage.setItem('selectedRoute', JSON.stringify(routePayload));
        localStorage.setItem('pendingFormData', JSON.stringify(formData));
        
        // 7. Chuyển sang chatbot
        console.log('🤖 Chuyển sang chatbot...');
        window.location.href = '/chatbot';
        
    } catch (error) {
        console.error('❌ Error:', error);
        if (error.message !== 'No origin selected' && error.message !== 'No destinations selected') {
            alert('Có lỗi xảy ra: ' + error.message);
        }
        
        submitBtn.disabled = false;
        submitBtn.textContent = 'Hoàn tất';
    }
});

// Hàm reset nút submit về trạng thái ban đầu
function resetSubmitButton() {
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Hoàn tất';
    }
}

// ===== KHỞI TẠO =====

document.addEventListener('DOMContentLoaded', () => {
    // Reset nút submit về trạng thái ban đầu (phòng trường hợp quay lại từ chatbot)
    resetSubmitButton();
    
    // Setup nút back để quay về Home
    const backBtn = document.querySelector('.back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            window.location.href = '/';
        });
    }
    
    // Setup autocomplete cho input xuất phát
    const originInput = document.getElementById('origin-input');
    if (originInput) {
        setupAutocomplete(originInput);
    }
    
    // Setup autocomplete cho destination đầu tiên
    const firstDestination = destinationsList.querySelector('.destination-item');
    if (firstDestination) {
        initDestinationItem(firstDestination);
        const firstInput = firstDestination.querySelector('.destination-input');
        if (firstInput) {
            setupAutocomplete(firstInput);
        }
    }
    
    updateDestinationVisibility();
});

// Xử lý khi trang được restore từ browser cache (khi quay lại bằng back button)
window.addEventListener('pageshow', (event) => {
    // Nếu trang được restore từ cache (back/forward navigation)
    if (event.persisted) {
        resetSubmitButton();
    }
});