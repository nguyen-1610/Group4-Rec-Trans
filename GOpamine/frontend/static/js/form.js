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

// Key để lưu form data
const FORM_DATA_KEY = 'savedFormData';

// Cấu hình Nominatim API
const NOMINATIM_CONFIG = {
    baseUrl: 'https://nominatim.openstreetmap.org/search',
    viewbox: '106.3,10.35,107.0,11.2', // TP.HCM
    bounded: 1,
    limit: 8,
    format: 'json',
    addressdetails: 1
};

let debounceTimer = null;

// ===== PHẦN LƯU VÀ KHÔI PHỤC FORM DATA =====

/**
 * Lưu toàn bộ dữ liệu form vào localStorage
 */
function saveFormData() {
    try {
        const originInput = document.getElementById('origin-input');
        const originPlace = getPlaceFromInput(originInput);
        
        const destinationInputs = document.querySelectorAll('.destination-input');
        const destinations = Array.from(destinationInputs).map(input => {
            const place = getPlaceFromInput(input);
            return {
                value: input.value,
                place: place
            };
        });
        
        const formData = {
            origin: {
                value: originInput.value,
                place: originPlace
            },
            destinations: destinations,
            budget: rangeSlider.value,
            passengers: document.querySelector('input[placeholder="Số hành khách"]').value,
            preferences: Array.from(document.querySelectorAll('.checkbox-item input:checked'))
                .map(cb => cb.parentElement.querySelector('span').textContent),
            timestamp: Date.now()
        };
        
        localStorage.setItem(FORM_DATA_KEY, JSON.stringify(formData));
        console.log('✅ Form data đã được lưu');
    } catch (error) {
        console.warn('Không thể lưu form data:', error);
    }
}

/**
 * Khôi phục dữ liệu form từ localStorage
 */
function restoreFormData() {
    try {
        const savedData = localStorage.getItem(FORM_DATA_KEY);
        if (!savedData) return false;
        
        const formData = JSON.parse(savedData);
        console.log('📋 Đang khôi phục form data...');
        
        // Khôi phục điểm xuất phát
        const originInput = document.getElementById('origin-input');
        if (formData.origin && formData.origin.value) {
            originInput.value = formData.origin.value;
            if (formData.origin.place) {
                originInput.dataset.placeData = JSON.stringify(formData.origin.place);
            }
        }
        
        // Khôi phục điểm đến
        if (formData.destinations && formData.destinations.length > 0) {
            // Xóa các destination cũ (trừ cái đầu tiên)
            const existingDestinations = destinationsList.querySelectorAll('.destination-item');
            existingDestinations.forEach((item, index) => {
                if (index > 0) item.remove();
            });
            
            // Điền dữ liệu vào các destination
            formData.destinations.forEach((dest, index) => {
                let destItem;
                
                if (index === 0) {
                    // Sử dụng destination đầu tiên có sẵn
                    destItem = destinationsList.querySelector('.destination-item');
                } else {
                    // Tạo destination mới
                    destItem = document.createElement('div');
                    destItem.className = 'destination-item';
                    destItem.draggable = true;
                    destItem.innerHTML = `
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
                    destinationsList.appendChild(destItem);
                    initDestinationItem(destItem);
                }
                
                const input = destItem.querySelector('.destination-input');
                input.value = dest.value;
                if (dest.place) {
                    input.dataset.placeData = JSON.stringify(dest.place);
                }
                setupAutocomplete(input);
            });
            
            updateDestinationVisibility();
        }
        
        // Khôi phục ngân sách
        if (formData.budget) {
            rangeSlider.value = formData.budget;
            budgetValue.textContent = formatCurrency(parseInt(formData.budget));
        }
        
        // Khôi phục số hành khách
        if (formData.passengers) {
            document.querySelector('input[placeholder="Số hành khách"]').value = formData.passengers;
        }
        
        // Khôi phục preferences
        if (formData.preferences && formData.preferences.length > 0) {
            document.querySelectorAll('.checkbox-item input[type="checkbox"]').forEach(checkbox => {
                const label = checkbox.parentElement.querySelector('span').textContent;
                checkbox.checked = formData.preferences.includes(label);
            });
        }
        
        console.log('✅ Form data đã được khôi phục');
        return true;
    } catch (error) {
        console.warn('Không thể khôi phục form data:', error);
        return false;
    }
}

/**
 * Xóa dữ liệu form đã lưu
 */
function clearSavedFormData() {
    localStorage.removeItem(FORM_DATA_KEY);
}

// ===== PHẦN MỚI: TÌM KIẾM VỚI NOMINATIM =====
document.addEventListener('DOMContentLoaded', () => {
    // === Xử lý Input Xuất phát & Dropdown ===
    const originInput = document.getElementById('origin-input');
    const originDropdown = document.getElementById('origin-dropdown');
    const gpsBtn = document.getElementById('btn-use-gps');
    const resultsContainer = document.getElementById('search-results-container');
    const divider = document.getElementById('dropdown-divider');

    if (originInput && originDropdown) {

        originInput.addEventListener('focus', () => {
            originDropdown.classList.remove('hidden');
        });

        document.addEventListener('click', (e) => {
            if (!originInput.contains(e.target) && !originDropdown.contains(e.target)) {
                originDropdown.classList.add('hidden');
            }
        });

        originInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            originDropdown.classList.remove('hidden'); 

            clearTimeout(debounceTimer);

            if (query.length < 3) {
                resultsContainer.innerHTML = '';
                if(divider) divider.classList.add('hidden');
                return;
            }

            debounceTimer = setTimeout(async () => {
                const places = await searchPlacesNominatim(query);
                
                displaySuggestionsInContainer(resultsContainer, divider, places, originInput);
            }, 300);
        });

        if (gpsBtn) {
            gpsBtn.addEventListener('click', () => {
                handleGetUserLocation(originInput, gpsBtn, originDropdown);
            });
        }
    }

    resetSubmitButton();
    const backBtn = document.querySelector('.back-btn');
    if (backBtn) backBtn.addEventListener('click', () => window.location.href = '/');

    const firstDestination = destinationsList.querySelector('.destination-item');
    if (firstDestination) {
        initDestinationItem(firstDestination);
        const firstInput = firstDestination.querySelector('.destination-input');
        if (firstInput) setupAutocomplete(firstInput); // Logic cũ cho input thường
    }
    updateDestinationVisibility();
});

function handleGetUserLocation(inputElement, btnElement, dropdownElement) {
    if (!navigator.geolocation) {
        alert("Trình duyệt không hỗ trợ định vị.");
        return;
    }

    // 1. UX Loading: Đổi giao diện nút bấm
    const icon = btnElement.querySelector('.icon');
    const mainText = btnElement.querySelector('.main');
    const originalIcon = icon.innerText;

    icon.innerText = '⏳';
    icon.classList.add('spinning'); // Class xoay tròn
    mainText.innerText = "Đang lấy tọa độ...";
    
    // Khóa input tạm thời
    inputElement.placeholder = "Đang định vị...";

    navigator.geolocation.getCurrentPosition(
        // === A. LẤY GPS THÀNH CÔNG ===
        async (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            console.log(`✅ GPS Raw: ${lat}, ${lng}`);

            // Bước đệm: Báo cho user biết đang tìm tên đường
            mainText.innerText = "Đang tìm địa chỉ...";
            inputElement.value = `📍 Đang lấy tên đường...`;

            try {
                // === B. GỌI API NOMINATIM ĐỂ DỊCH TÊN ĐƯỜNG ===
                // Sử dụng API Reverse Geocoding miễn phí
                const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
                
                const response = await fetch(url, {
                    headers: { 'User-Agent': 'GOpamine-App/1.0' } // Bắt buộc
                });

                if (!response.ok) throw new Error('Nominatim Error');
                
                const data = await response.json();
                console.log("🏠 Address:", data);

                // === C. XỬ LÝ TÊN HIỂN THỊ CHO ĐẸP ===
                // Nominatim trả về rất dài, ta lọc lấy: Số nhà + Đường + Quận
                const addr = data.address;
                let displayName = "";
                
                // Ưu tiên lấy tên đường cụ thể
                const road = addr.road || addr.pedestrian || addr.street || "";
                const number = addr.house_number || "";
                const district = addr.city_district || addr.district || addr.suburb || "";
                
                if (road) {
                    displayName = number ? `${number} ${road}` : road;
                    if (district) displayName += `, ${district}`;
                } else {
                    // Nếu ở nơi hẻo lánh không có tên đường, lấy tên hiển thị chung
                    displayName = data.display_name.split(',').slice(0, 3).join(',');
                }

                // Thêm icon cho đẹp
                const finalString = `📍 ${displayName}`;

                // === D. CẬP NHẬT GIAO DIỆN ===
                inputElement.value = finalString;

                // QUAN TRỌNG: Tạo object dữ liệu chuẩn để Submit Form đọc được
                // Phải khớp cấu trúc với hàm getPlaceFromInput
                const placeData = {
                    name: displayName, // Tên để hiển thị
                    lat: lat,
                    lon: lng,
                    type: 'gps',       // Đánh dấu là GPS
                    address: data.display_name
                };
                
                // Lưu vào dataset
                inputElement.dataset.placeData = JSON.stringify(placeData);

            } catch (error) {
                console.error("Lỗi lấy tên đường:", error);
                // Fallback: Nếu lỗi mạng, đành hiện tọa độ số
                inputElement.value = `📍 Vị trí hiện tại (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
                
                // Vẫn phải lưu dataset để submit được
                const backupData = { name: "Vị trí hiện tại", lat: lat, lon: lng, type: 'gps' };
                inputElement.dataset.placeData = JSON.stringify(backupData);

            } finally {
                // === E. DỌN DẸP GIAO DIỆN ===
                dropdownElement.classList.add('hidden'); // Ẩn menu
                
                // Reset nút bấm về trạng thái cũ
                icon.innerText = originalIcon;
                icon.classList.remove('spinning');
                mainText.innerText = "Sử dụng vị trí hiện tại";
                inputElement.placeholder = "Nhập điểm đi hoặc chọn bên dưới...";
            }
        },
        // === F. LỖI GPS (Do người dùng chặn quyền) ===
        (error) => {
            console.error(error);
            alert("Không thể lấy vị trí. Vui lòng cấp quyền truy cập vị trí trên trình duyệt.");
            
            // Reset nút
            icon.innerText = originalIcon;
            icon.classList.remove('spinning');
            mainText.innerText = "Sử dụng vị trí hiện tại";
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}
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
            headers: { 'User-Agent': 'RouteOptimizer/1.0' }
        });
        if (!response.ok) throw new Error('Nominatim API error');
        const results = await response.json();
        return results.map(place => ({
            id: place.place_id,
            osm_id: place.osm_id,
            name: place.display_name,
            lat: parseFloat(place.lat),
            lon: parseFloat(place.lon),
            type: place.type,
            category: place.class,
            address: place.address,
            source: 'nominatim'
        }));
    } catch (error) {
        console.error('Lỗi tìm kiếm:', error);
        return [];
    }
}

function displaySuggestionsInContainer(container, divider, places, inputElement) {
    container.innerHTML = ''; 
    
    if (places.length === 0) {
        if(divider) divider.classList.add('hidden');
        container.innerHTML = '<div style="padding:10px 15px; color:#999; font-size:13px;">Không tìm thấy địa điểm</div>';
        return;
    }

    if(divider) divider.classList.remove('hidden');

    places.forEach(place => {
        const div = document.createElement('div');
        div.className = 'search-result-item'; 
        const shortName = place.name.split(',').slice(0, 2).join(',');
        
        div.innerHTML = `
            <span class="icon-place" style="margin-right:10px;">${getPlaceIcon(place.type)}</span>
            <div style="display:flex; flex-direction:column;">
                <span style="font-weight:500; font-size:14px;">${shortName}</span>
                <span style="font-size:11px; color:#888;">${place.type}</span>
            </div>
        `;
        
        div.addEventListener('click', () => {
            inputElement.value = shortName;
            inputElement.dataset.placeData = JSON.stringify(place);
            // Ẩn menu
            document.getElementById('origin-dropdown').classList.add('hidden');
        });
        
        container.appendChild(div);
    });
}

function setupAutocomplete(inputElement) {
    let suggestionsDiv = inputElement.nextElementSibling;
    if (!suggestionsDiv || !suggestionsDiv.classList.contains('autocomplete-suggestions')) {
        suggestionsDiv = document.createElement('div');
        suggestionsDiv.className = 'autocomplete-suggestions';
        inputElement.parentNode.insertBefore(suggestionsDiv, inputElement.nextSibling);
    }
    inputElement.addEventListener('input', async (e) => {
        const query = e.target.value.trim();
        
        // Lưu form data mỗi khi có thay đổi
        saveFormData();

        // Clear debounce cũ
        clearTimeout(debounceTimer);
        if (query.length < 3) {
            suggestionsDiv.innerHTML = '';
            suggestionsDiv.style.display = 'none';
            return;
        }
        debounceTimer = setTimeout(async () => {
            const places = await searchPlacesNominatim(query);
            displaySuggestions(suggestionsDiv, places, inputElement);
        }, 300);
    });
    document.addEventListener('click', (e) => {
        if (!inputElement.contains(e.target) && !suggestionsDiv.contains(e.target)) {
            suggestionsDiv.style.display = 'none';
        }
    });
}

function displaySuggestions(container, places, inputElement) {
    if (places.length === 0) {
        container.innerHTML = '<div class="suggestion-item no-results">Không tìm thấy kết quả</div>';
        container.style.display = 'block';
        return;
    }
    container.innerHTML = places.map(place => {
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
    container.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
            const placeData = JSON.parse(item.dataset.place);
            inputElement.value = placeData.name.split(',').slice(0, 2).join(',');
            inputElement.dataset.placeData = JSON.stringify(placeData);
            container.style.display = 'none';

            // Lưu form data sau khi chọn địa điểm
            saveFormData();
        });
    });
}

function getPlaceIcon(type) {
    const iconMap = {'cafe': '☕','restaurant': '🍽️','school': '🏫','hospital': '🏥','park': '🌳','hotel': '🏨','shop': '🛒','mall': '🏬','museum': '🏛️','theatre': '🎭','bus_stop': '🚏','railway': '🚉','airport': '✈️'};
    return iconMap[type] || '📍';
}

function getPlaceFromInput(inputElement) {
    const placeData = inputElement.dataset.placeData;
    if (!placeData) return null;
    try { return JSON.parse(placeData); } 
    catch (error) { console.error('Lỗi parse:', error); return null; }
}

// ===== FORMAT VÀ SLIDER =====

function formatCurrency(value) {
    return 'đ0-' + value.toLocaleString('vi-VN');
}

rangeSlider.addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    budgetValue.textContent = formatCurrency(value);
    saveFormData(); // Lưu khi thay đổi budget
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

    saveFormData(); // Lưu khi thêm destination
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
            saveFormData(); // Lưu sau khi xóa destination
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
    saveFormData(); // Lưu khi thay đổi thứ tự
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
        saveFormData(); // Lưu khi thay đổi preferences
    }
});

// Lắng nghe sự kiện thay đổi preferences
document.addEventListener('change', (e) => {
    if (e.target.type === 'checkbox' && e.target.closest('.checkbox-item')) {
        saveFormData();
    }
});

// Lắng nghe sự kiện thay đổi số hành khách
const passengersInput = document.querySelector('input[placeholder="Số hành khách"]');
if (passengersInput) {
    passengersInput.addEventListener('input', saveFormData);
}

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

        saveFormData(); // Lưu form data trước khi submit
        
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

    // Reset nút submit
    resetSubmitButton();
    
    // Khôi phục form data nếu có
    const restored = restoreFormData();
    if (restored) {
        console.log('✅ Đã khôi phục dữ liệu form trước đó');
    }
    
    // Setup nút back để quay về Home
    const backBtn = document.querySelector('.back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            // Xóa form data khi quay về home
            clearSavedFormData();
            window.location.href = '/';
        });
    }


    // ============================================================
    // 2. LOGIC CHO Ô XUẤT PHÁT (SỬA LẠI ĐỂ KHÔNG BỊ ĐÈ)
    // ============================================================
    const originInput = document.getElementById('origin-input');
    const originDropdown = document.getElementById('origin-dropdown');
    const resultsContainer = document.getElementById('search-results-container');
    const divider = document.getElementById('dropdown-divider');
    const gpsBtn = document.getElementById('btn-use-gps');

    if (originInput && originDropdown) {
        
        // A. Hiện menu khi focus
        originInput.addEventListener('focus', () => {
            originDropdown.classList.remove('hidden');
        });

        // B. Ẩn menu khi click ra ngoài
        document.addEventListener('click', (e) => {
            if (!originInput.contains(e.target) && !originDropdown.contains(e.target)) {
                originDropdown.classList.add('hidden');
            }
        });

        // C. TÌM KIẾM: Viết riêng cho Origin Input (Thay thế setupAutocomplete cũ)
        originInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            originDropdown.classList.remove('hidden'); // Luôn hiện dropdown để thấy nút GPS

            clearTimeout(debounceTimer); // Xóa timer cũ

            if (query.length < 3) {
                // Nếu chưa đủ chữ -> Xóa kết quả tìm kiếm, nhưng GIỮ LẠI nút GPS
                resultsContainer.innerHTML = '';
                if(divider) divider.classList.add('hidden');
                return;
            }

            // Gọi API sau 300ms
            debounceTimer = setTimeout(async () => {
                // Gọi hàm tìm kiếm Nominatim có sẵn của bạn
                const places = await searchPlacesNominatim(query);
                
                // Hiển thị kết quả vào container BÊN DƯỚI nút GPS
                renderSearchResults(places);
            }, 300);
        });

        // Hàm vẽ kết quả tìm kiếm vào đúng chỗ
        function renderSearchResults(places) {
            resultsContainer.innerHTML = ''; // Xóa kết quả cũ
            
            if (places.length === 0) {
                if(divider) divider.classList.add('hidden');
                resultsContainer.innerHTML = '<div style="padding:10px 15px; color:#999;">Không tìm thấy kết quả</div>';
                return;
            }

            if(divider) divider.classList.remove('hidden'); // Hiện đường kẻ

            places.forEach(place => {
                // Tách tên ngắn gọn
                const shortName = place.name.split(',').slice(0, 2).join(',');
                const icon = getPlaceIcon(place.type); // Dùng hàm icon cũ

                const div = document.createElement('div');
                div.className = 'search-result-item';
                div.innerHTML = `
                    <span class="suggestion-icon" style="margin-right:10px">${icon}</span>
                    <div class="suggestion-content">
                        <div class="suggestion-name" style="font-weight:500">${shortName}</div>
                        <div class="suggestion-address" style="font-size:12px; color:#888">${place.type}</div>
                    </div>
                `;

                // Sự kiện khi chọn địa điểm
                div.addEventListener('click', () => {
                    originInput.value = shortName;
                    // Lưu dữ liệu place vào dataset
                    originInput.dataset.placeData = JSON.stringify(place);
                    originDropdown.classList.add('hidden');
                });

                resultsContainer.appendChild(div);
            });
        }

        // D. Logic nút GPS (Kết nối với hàm handleGetUserLocation đã viết ở trên)
        if (gpsBtn) {
            gpsBtn.addEventListener('click', () => {
                handleGetUserLocation(originInput, gpsBtn, originDropdown);
            });
        }
    }

    // ============================================================
    // 3. LOGIC CHO CÁC Ô ĐIỂM ĐẾN (GIỮ NGUYÊN AUTOCOMPLETE CŨ)
    // ============================================================
    
    // Autocomplete cho Destination đầu tiên
    const firstDestination = destinationsList.querySelector('.destination-item');
    if (firstDestination) {
        initDestinationItem(firstDestination);
        const firstInput = firstDestination.querySelector('.destination-input');
        // Vẫn dùng setupAutocomplete cũ cho điểm đến vì nó không cần nút GPS
        if (firstInput) setupAutocomplete(firstInput); 
    }
    
    updateDestinationVisibility();
});

// Xử lý khi trang được restore từ browser cache (khi quay lại bằng back button)
window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        resetSubmitButton();
        // Khôi phục lại form data khi quay lại từ cache
        restoreFormData();
    }
});