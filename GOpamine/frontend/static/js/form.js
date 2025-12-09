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
            const passInput = document.getElementById('passenger-input');
            if (passInput) {
                passInput.value = formData.passengers;
                // Kích hoạt sự kiện để đồng bộ sang ô Visual (nếu cần thiết ngay lập tức)
                passInput.dispatchEvent(new Event('input')); 
            }
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

// [FIX] Sửa lại hàm này trong form.js
async function requestRouteFromBackend(startPlace, destinations, vehicle = DEFAULT_VEHICLE) {
    // Kiểm tra nếu chỉ có 1 điểm đến -> dùng logic cũ
    // Nếu có nhiều điểm đến -> dùng logic TSP (plan-trip)
    const isMultiStop = destinations.length > 1;
    
    // Endpoint backend: Dùng /plan-trip nếu nhiều điểm (đã có trong astar.py)
    // Lưu ý: check lại file astar.py xem route exact là gì, thường là /api/plan-trip
    const endpoint = isMultiStop ? `${API_BASE}/plan-trip` : `${API_BASE}/find-route-osm`;

    // Chuẩn bị body request tùy theo API
    let bodyPayload = {};

    if (isMultiStop) {
        // Cấu trúc cho /api/plan-trip (trong astar.py: plan_multi_stop_trip)
        bodyPayload = {
            start_id: startPlace.name, // astar.py dùng tên để geocode lại
            destinations: destinations.map(d => d.name), // Gửi danh sách tên các điểm đến
            vehicle_type: vehicle.type,
            is_student: false 
        };
    } else {
        // Cấu trúc cũ cho 1 điểm đến
        const endPlace = destinations[0];
        bodyPayload = {
            start: { lat: startPlace.lat, lon: startPlace.lon, name: startPlace.name },
            end: { lat: endPlace.lat, lon: endPlace.lon, name: endPlace.name },
            vehicle_type: vehicle.type,
            vehicle_speed: vehicle.speed
        };
    }

    console.log(`📡 Calling API: ${endpoint}`, bodyPayload);

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
    });
    
    const result = await response.json();
    if (!result.success) {
        throw new Error(result.error || 'Không tìm được tuyến đường');
    }
    
    // [QUAN TRỌNG] Chuẩn hóa dữ liệu trả về để map_trans.js hiểu
    if (isMultiStop) {
        // API plan-trip trả về: total_distance_km, segments, optimized_order
        // Ta cần map nó về format mà map_trans.js đang mong đợi (route_coordinates, distance_km)
        
        // Gom tất cả tọa độ của các chặng (segments) lại thành 1 đường dài
        let allCoords = [];
        let totalDist = result.data.total_distance_km;
        
        if (result.data.segments) {
            result.data.segments.forEach(seg => {
                if (seg.geometry) allCoords = allCoords.concat(seg.geometry);
            });
        }

        return {
            route_coordinates: allCoords, // Để vẽ đường nối liền
            distance_km: totalDist,       // Tổng quãng đường để tính tiền
            waypoints: result.data.optimized_order, // Thứ tự điểm đi đã tối ưu
            is_multi_stop: true,
            details: result.data // Lưu lại để hiển thị chi tiết nếu cần
        };
    } else {
        // Trả về data cũ
        return result.data;
    }
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

// ... (Phần đầu sự kiện click giữ nguyên) ...
submitBtn.addEventListener('click', async () => {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Đang xử lý...'; // Hoặc lấy từ t.form_processing nếu muốn chuẩn chỉ

    // [BỔ SUNG] Lấy từ điển ngôn ngữ hiện tại để hiển thị popup đúng tiếng
    const currentLang = localStorage.getItem('userLang') || 'vi';
    const t = window.translations ? window.translations[currentLang] : null;

    // Fallback text (phòng trường hợp chưa nạp từ điển)
    const txtOrigin = t ? t.alert_no_origin : 'Vui lòng chọn điểm xuất phát!';
    const txtDest = t ? t.alert_no_dest : 'Vui lòng chọn ít nhất một điểm đến!';
    const txtTitle = currentLang === 'en' ? 'Missing Information' : 'Thiếu thông tin';
    
    try {
        // 1. Lấy điểm xuất phát
        const originInput = document.getElementById('origin-input');
        const startPlace = getPlaceFromInput(originInput);
        
        if (!startPlace) {
            // [THAY THẾ ALERT CŨ BẰNG SWEETALERT]
            Swal.fire({
                icon: 'warning',
                title: txtTitle,
                text: txtOrigin,
                confirmButtonColor: '#3C7363', // Màu xanh chủ đạo của App
                confirmButtonText: 'OK'
            });
            throw new Error('No origin selected');
        }
        
        // 2. Lấy điểm đến
        const destinationInputs = document.querySelectorAll('.destination-input');
        const destinations = Array.from(destinationInputs)
            .map(input => getPlaceFromInput(input))
            .filter(place => place !== null);
        
        if (destinations.length === 0) {
            // [THAY THẾ ALERT CŨ BẰNG SWEETALERT]
            Swal.fire({
                icon: 'warning',
                title: txtTitle,
                text: txtDest,
                confirmButtonColor: '#3C7363',
                confirmButtonText: 'OK'
            });
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
            passengers: document.getElementById('passenger-input').value.trim(),
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
        
                // 5. Gọi backend để tính route
        console.log('🧭 Đang tính toán đường đi...');
                
        // [FIX] Truyền toàn bộ mảng destinations thay vì chỉ primaryDestination
        const routeData = await requestRouteFromBackend(startPlace, destinations, DEFAULT_VEHICLE);
                
        // 6. Lưu route vào localStorage
        const routePayload = {
            timestamp: Date.now(),
            start_place: startPlace,
            end_place: destinations[destinations.length - 1], // Điểm cuối cùng trong hành trình
            // Các trường dữ liệu quan trọng để map_trans.js vẽ và tính tiền:
            route_coordinates: routeData.route_coordinates, 
            distance_km: routeData.distance_km,
            waypoints: routeData.waypoints,
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
    // Đọc query parameter và điền điểm đến nếu có
    const urlParams = new URLSearchParams(window.location.search);
    const destination = urlParams.get('destination');
    
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
        if (firstInput) {
            setupAutocomplete(firstInput);
            
            // Nếu có destination từ query parameter, điền vào ô đầu tiên
            if (destination) {
                const decodedDestination = decodeURIComponent(destination);
                firstInput.value = decodedDestination;
                
                // Tự động tìm kiếm để lấy thông tin địa điểm và điền vào dataset
                setTimeout(async () => {
                    const places = await searchPlacesNominatim(decodedDestination);
                    if (places && places.length > 0) {
                        // Lấy kết quả đầu tiên phù hợp nhất
                        const placeData = places[0];
                        firstInput.value = placeData.name.split(',').slice(0, 2).join(',');
                        firstInput.dataset.placeData = JSON.stringify(placeData);
                    }
                }, 500);
            }
        }
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

//<!-- ===== JAVASCRIPT XỬ LÝ PROFILE ===== -->
// === PROFILE DROPDOWN TOGGLE ===
const profileTrigger = document.getElementById('profileTrigger');
const profileDropdown = document.getElementById('profileDropdown');

if (profileTrigger && profileDropdown) {
    profileTrigger.addEventListener('click', function(e) {
        e.stopPropagation();
        profileDropdown.classList.toggle('active');
    });

    document.addEventListener('click', function(e) {
        if (profileDropdown.classList.contains('active')) {
            if (!profileDropdown.contains(e.target) && e.target !== profileTrigger) {
                profileDropdown.classList.remove('active');
            }
        }
    });
}

// === LOGOUT FUNCTION ===
async function handleLogout() {
    try {
        const response = await fetch('http://127.0.0.1:5000/api/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });

        const result = await response.json();
        if (result.success) {
            alert('Đăng xuất thành công!');
            window.location.href = '/';
        } else {
            alert('Lỗi đăng xuất: ' + (result.message || 'Không xác định'));
        }
    } catch (error) {
        console.error('Logout Error:', error);
        alert('Lỗi hệ thống: ' + error.message);
    }
}

const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', function(e) {
        e.preventDefault();
        if (confirm('Bạn có chắc muốn đăng xuất?')) {
            handleLogout();
        }
    });
}

// === XỬ LÝ CLICK VÀO PROFILE ICON KHI CHƯA ĐĂNG NHẬP ===
const profileIcon = document.querySelector('.profile-icon');
if (profileIcon) {
    profileIcon.style.cursor = 'pointer';
    profileIcon.addEventListener('click', function() {
        window.location.href = '/login';
    });
}

// ============================================================
// [I18N] TỪ ĐIỂN & LOGIC CHO FORM (FIX LANGUAGE LOSS)
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    // 1. Khởi tạo kho từ điển
    window.translations = window.translations || { vi: {}, en: {} };

    if (window.translations) {
        // --- TIẾNG VIỆT ---
        Object.assign(window.translations.vi, {
            form_title: "Thiết lập lộ trình",
            form_origin_label: "Điểm xuất phát",
            form_origin_ph: "Nhập điểm đi hoặc chọn bên dưới...",
            form_gps_main: "Sử dụng vị trí hiện tại",
            form_gps_sub: "Nhấn để lấy tọa độ GPS",
            form_dest_label: "Điểm đến",
            form_add_btn: "Thêm",
            form_dest_ph: "Tìm kiếm địa điểm...",
            form_budget_label: "Ngân sách",
            form_passenger_label: "Số hành khách",
            form_passenger_ph: "Số hành khách",
            form_pref_header: "Ưu tiên",
            form_pref_hint: "Lựa chọn các ưu tiên theo sở thích của bạn dưới đây.",
            pref_speed: "Tốc độ",
            pref_saving: "Tiết kiệm",
            pref_comfort: "Thoải mái",
            pref_safety: "An toàn",
            pref_balanced: "Cân bằng",
            form_add_pref_btn: "Thêm",
            form_submit_btn: "Hoàn tất",
            form_processing: "Đang xử lý...",
            alert_no_origin: "Vui lòng chọn điểm xuất phát từ danh sách gợi ý!",
            alert_no_dest: "Vui lòng chọn ít nhất một điểm đến!"
        });

        // --- TIẾNG ANH ---
        Object.assign(window.translations.en, {
            form_title: "Trip Planner",
            form_origin_label: "Starting Point",
            form_origin_ph: "Enter origin or select below...",
            form_gps_main: "Use Current Location",
            form_gps_sub: "Tap to get GPS coordinates",
            form_dest_label: "Destinations",
            form_add_btn: "Add",
            form_dest_ph: "Search destination...",
            form_budget_label: "Budget",
            form_passenger_label: "Passengers",
            form_passenger_ph: "Number of passengers",
            form_pref_header: "Preferences",
            form_pref_hint: "Select your preferences below.",
            pref_speed: "Speed",
            pref_saving: "Economical",
            pref_comfort: "Comfort",
            pref_safety: "Safety",
            pref_balanced: "Balanced",
            form_add_pref_btn: "Add",
            form_submit_btn: "Find Route",
            form_processing: "Processing...",
            alert_no_origin: "Please select a valid origin from suggestions!",
            alert_no_dest: "Please select at least one destination!"
        });
    }

    // 2. Hàm lấy ngôn ngữ (Ưu tiên localStorage)
    window.getCurrentLanguage = function() {
        return localStorage.getItem('userLang') || localStorage.getItem('language') || 'vi';
    };

    // 3. Hàm áp dụng ngôn ngữ (Core Logic)
    window.applyLanguage = function() {
        const lang = window.getCurrentLanguage();
        const t = window.translations[lang] || window.translations['vi'];

        // Dịch Text Content
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (t[key]) el.textContent = t[key];
        });

        // Dịch Placeholder
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (t[key]) el.placeholder = t[key];
        });

        // Update Text Nút Submit
        const submitBtn = document.querySelector('.submit-btn');
        if (submitBtn && !submitBtn.disabled && t.form_submit_btn) {
            submitBtn.textContent = t.form_submit_btn;
        }
    };

    // 4. Hook vào sự kiện load
    // Chạy ngay lập tức, không chờ timeout lâu
    window.applyLanguage(); 

    // 5. Hook vào nút "Thêm điểm đến" (Dynamic UI)
    const addDestBtn = document.getElementById('add-destination-btn');
    if (addDestBtn) {
        addDestBtn.addEventListener('click', () => {
            setTimeout(() => {
                window.applyLanguage(); // Dịch lại ngay sau khi thêm ô mới
            }, 10);
        });
    }
});