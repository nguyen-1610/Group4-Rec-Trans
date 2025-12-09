/**
 * 🛠️ LOCATION UTILS
 * Chứa các hàm dùng chung cho cả Form và Map:
 * - Gọi API Nominatim (Search & Reverse Geocoding)
 * - Xử lý GPS
 * - Autocomplete Logic
 * - Format tiền tệ/Icon
 */

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

function getPlaceFromInput(inputElement) {
    const placeData = inputElement.dataset.placeData;
    if (!placeData) return null;
    try { return JSON.parse(placeData); } 
    catch (error) { console.error('Lỗi parse:', error); return null; }
}

/**
 * [UPDATED] Hàm lấy Icon chuyên nghiệp hơn sử dụng Font Awesome
 */
function getPlaceIcon(type) {
    const iconMap = {
        'cafe': '<i class="fas fa-mug-hot"></i>',
        'restaurant': '<i class="fas fa-utensils"></i>',
        'school': '<i class="fas fa-school"></i>',
        'hospital': '<i class="fas fa-hospital"></i>',
        'park': '<i class="fas fa-tree"></i>',
        'hotel': '<i class="fas fa-hotel"></i>',
        'shop': '<i class="fas fa-store"></i>',
        'mall': '<i class="fas fa-building"></i>',
        'museum': '<i class="fas fa-landmark"></i>',
        'theatre': '<i class="fas fa-masks-theater"></i>',
        'bus_stop': '<i class="fas fa-bus"></i>',
        'railway': '<i class="fas fa-train"></i>',
        'airport': '<i class="fas fa-plane"></i>'
    };
    return iconMap[type] || '<i class="fas fa-map-marker-alt"></i>';
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

function setupAutocomplete(inputElement, onPlaceSelected, onInputUpdated = () => {}) {
    let suggestionsDiv = inputElement.nextElementSibling;
    
    if (!suggestionsDiv || !suggestionsDiv.classList.contains('autocomplete-suggestions')) {
        suggestionsDiv = document.createElement('div');
        suggestionsDiv.className = 'autocomplete-suggestions';
        inputElement.parentNode.insertBefore(suggestionsDiv, inputElement.nextSibling);
    }

    inputElement.addEventListener('input', async (e) => {
        const query = e.target.value.trim();
        onInputUpdated(); 
        clearTimeout(debounceTimer);
        if (query.length < 3) {
            suggestionsDiv.innerHTML = '';
            suggestionsDiv.style.display = 'none';
            return;
        }
        debounceTimer = setTimeout(async () => {
            const places = await searchPlacesNominatim(query);
            displaySuggestions(suggestionsDiv, places, inputElement, onPlaceSelected);
        }, 300);
    });

    document.addEventListener('click', (e) => {
        if (!inputElement.contains(e.target) && !suggestionsDiv.contains(e.target)) {
            suggestionsDiv.style.display = 'none';
        }
    });
}

// Thay thế hàm displaySuggestions cũ bằng hàm này:
function displaySuggestions(container, places, inputElement, onPlaceSelected) {
    if (places.length === 0) {
        container.innerHTML = '<div class="suggestion-item no-results">Không tìm thấy kết quả</div>';
        container.style.display = 'block';
        return;
    }
    
    container.innerHTML = places.map(place => {
        // [LOGIC MỚI] Tách chuỗi Tên và Địa chỉ thông minh hơn
        // Dữ liệu Nominatim thường dạng: "Tên Riêng, Số Nhà, Đường, Phường, Quận..."
        const parts = place.name.split(',');
        
        // Lấy phần đầu làm Tên chính (VD: Aeon Mall Tân Phú)
        const title = parts[0].trim(); 
        
        // Lấy các phần còn lại làm địa chỉ chi tiết (VD: 30 Bờ Bao Tân Thắng...)
        // Nếu không có phần sau thì dùng tạm loại địa điểm (VD: supermarket)
        const address = parts.length > 1 ? parts.slice(1).join(',').trim() : place.type;

        const icon = getPlaceIcon(place.type); // Hàm lấy icon có sẵn của bạn
        
        return `
            <div class="suggestion-item" data-place='${JSON.stringify(place)}'>
                <div class="sugg-icon-wrapper">
                    ${icon}
                </div>
                <div class="sugg-text-wrapper">
                    <div class="sugg-title">${title}</div>
                    <div class="sugg-address">${address}</div>
                </div>
            </div>
        `;
    }).join('');
    
    container.style.display = 'block';
    
    // Giữ nguyên logic click
    container.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
            const placeData = JSON.parse(item.dataset.place);
            // Khi chọn thì chỉ lấy tên ngắn gọn đưa vào input cho đẹp
            const shortName = placeData.name.split(',')[0].trim(); 
            inputElement.value = shortName;
            container.style.display = 'none';
            onPlaceSelected(placeData, inputElement);
        });
    });
}

function handleGetUserLocation(inputElement, btnElement, dropdownElement) {
    if (!navigator.geolocation) {
        alert("Trình duyệt không hỗ trợ định vị.");
        return;
    }

    const icon = btnElement.querySelector('.icon');
    const mainText = btnElement.querySelector('.main');
    const originalIconContent = icon.innerHTML;

    // [UPDATED] Thay icon đồng hồ cát bằng Font Awesome (có hiệu ứng xoay)
    icon.innerHTML = '<i class="fas fa-hourglass-half fa-spin"></i>'; 
    mainText.innerText = "Đang lấy tọa độ...";
    
    inputElement.placeholder = "Đang định vị...";

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            console.log(`✅ GPS Raw: ${lat}, ${lng}`);

            mainText.innerText = "Đang tìm địa chỉ...";
            
            // [UPDATED] Bỏ emoji '📍' vì ta sẽ dùng icon overlay đẹp hơn
            inputElement.value = "Đang lấy tên đường..."; 

            try {
                const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
                const response = await fetch(url, { headers: { 'User-Agent': 'GOpamine-App/1.0' } });

                if (!response.ok) throw new Error('Nominatim Error');
                const data = await response.json();
                console.log("🏠 Address:", data);

                const addr = data.address;
                let displayName = "";
                const road = addr.road || addr.pedestrian || addr.street || "";
                const number = addr.house_number || "";
                const district = addr.city_district || addr.district || addr.suburb || "";
                
                if (road) {
                    displayName = number ? `${number} ${road}` : road;
                    if (district) displayName += `, ${district}`;
                } else {
                    displayName = data.display_name.split(',').slice(0, 3).join(',');
                }

                // [UPDATED] Chỉ gán tên đường (Text), không kèm Emoji
                inputElement.value = displayName;

                const placeData = {
                    name: displayName,
                    lat: lat,
                    lon: lng,
                    type: 'gps',
                    address: data.display_name
                };
                
                inputElement.dataset.placeData = JSON.stringify(placeData);

                // [UPDATED] Nếu là trang form, đổi icon overlay thành icon Nhà (Home)
                // Logic: Tìm icon overlay ngay trước input này và đổi class
                const overlayIcon = inputElement.parentElement.querySelector('.custom-input-icon');
                if(overlayIcon) {
                    overlayIcon.className = 'fas fa-home custom-input-icon'; // Đổi thành icon Nhà
                }

            } catch (error) {
                console.error("Lỗi lấy tên đường:", error);
                // Fallback không có emoji
                inputElement.value = `Vị trí hiện tại (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
                
                const backupData = { name: "Vị trí hiện tại", lat: lat, lon: lng, type: 'gps' };
                inputElement.dataset.placeData = JSON.stringify(backupData);

            } finally {
                dropdownElement.classList.add('hidden');
                icon.innerHTML = originalIconContent; // Trả lại icon cũ cho nút bấm
                mainText.innerText = "Sử dụng vị trí hiện tại";
                inputElement.placeholder = "Nhập điểm đi hoặc chọn bên dưới...";
            }
        },
        (error) => {
            console.error(error);
            alert("Không thể lấy vị trí. Vui lòng cấp quyền truy cập vị trí.");
            icon.innerHTML = originalIconContent;
            mainText.innerText = "Sử dụng vị trí hiện tại";
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

// =========================================================
// [AUTO SETUP UI]
// Tự động chèn CSS và Icon vào trang Form để giao diện đẹp hơn
// =========================================================
(function autoSetupUI() {
    // 1. Inject CSS (Màu sắc, Icon Overlay, Padding Input)
    const css = `
        /* Màu icon trong danh sách gợi ý */
        .suggestion-icon i {
            color: #3C7363;
            font-size: 16px;
            width: 20px;
            text-align: center;
        }
        
        .suggestion-item:hover .suggestion-icon i {
            transform: scale(1.1);
            transition: transform 0.2s ease;
        }

        /* [NEW] Style cho Icon đè lên Input (Trang Form) */
        .custom-input-icon {
            position: absolute;
            left: 12px;
            top: 50%;
            transform: translateY(-50%);
            color: #3C7363; /* Màu xanh chủ đạo */
            font-size: 18px;
            z-index: 2;
            pointer-events: none; /* Cho phép click xuyên qua icon vào input */
        }

        /* [NEW] Đẩy chữ sang phải để không bị icon che */
        #origin-input.has-icon {
            padding-left: 40px !important; 
        }
    `;
    
    const style = document.createElement('style');
    style.type = 'text/css';
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
    console.log("✅ Đã inject CSS Icon (location-utils.js)");

    // 2. Tự động chèn Icon vào trang Form (Tìm input có ID origin-input)
    // Lý do: Trang Map đã có icon rồi, chỉ trang Form là chưa có
    const originInput = document.getElementById('origin-input');
    
    if (originInput && !originInput.parentElement.querySelector('.custom-input-icon')) {
        // Tạo icon (Mặc định là Map Marker)
        const icon = document.createElement('i');
        icon.className = 'fas fa-map-marker-alt custom-input-icon';
        
        // Chèn icon vào trước input trong cùng 1 div cha
        originInput.parentElement.insertBefore(icon, originInput);
        
        // Thêm class để input tự padding sang phải
        originInput.classList.add('has-icon');
        
        console.log("✅ Đã chèn Icon Overlay vào origin-input");
    }
})();

// =========================================================
// [NEW] HÀM TẠO DÒNG INPUT ĐỊA ĐIỂM (DÙNG CHUNG CHO MAP & FORM)
// =========================================================

/**
 * Tạo một dòng input địa điểm với Label (A, B, C) và logic Autocomplete
 * @param {number} index - Số thứ tự (0, 1, 2...)
 * @param {object} placeData - Dữ liệu địa điểm {name, lat, lon}
 * @param {boolean} isRemovable - Có hiện nút xóa không?
 * @param {function} onUpdate - Callback khi user chọn địa điểm mới (data, element)
 * @param {function} onRemove - Callback khi user bấm xóa
 * @returns {HTMLElement} - Thẻ div chứa dòng input
 */
function createRouteInputRow(index, placeData, isRemovable, onUpdate, onRemove) {
    // 1. Tính toán Nhãn & Màu sắc
    const label = String.fromCharCode(65 + index); // 0->A, 1->B...
    let color = '#fbbc04'; // Vàng (Trung gian)
    
    // Logic màu giống hệt trên Map
    if (index === 0) color = '#4285f4'; // Start: Xanh
    // Lưu ý: Logic màu điểm cuối sẽ được xử lý ở bước render cha, 
    // nhưng ở đây ta cứ mặc định là Vàng, lát nữa CSS hoặc logic cha sẽ ghi đè nếu cần.
    // Tuy nhiên, để đơn giản, ta có thể nhận tham số 'isLast' hoặc để logic màu linh hoạt hơn.
    // Tạm thời ta để class CSS xử lý màu.

    const container = document.createElement('div');
    container.className = 'input-group route-row'; // Thêm class route-row để dễ style
    container.dataset.index = index;
    
    // 2. Tạo HTML (Icon A/B/C + Input + Nút Xóa)
    // Style icon tròn giống trên Map
    const iconHtml = `
        <div class="waypoint-icon" style="background-color: ${color}">
            ${label}
        </div>
    `;

    const removeBtnHtml = isRemovable 
        ? `<button class="remove-wp-btn" title="Xóa điểm này">×</button>` 
        : '';

    container.innerHTML = `
        ${iconHtml}
        <div class="input-wrapper-cell" style="flex: 1; position: relative;">
            <input type="text" class="map-input" 
                   placeholder="${index === 0 ? 'Chọn điểm đi' : 'Chọn điểm đến'}" 
                   value="${placeData.name || ''}" 
                   autocomplete="off"
                   style="width: 100%; box-sizing: border-box;">
        </div>
        ${removeBtnHtml}
    `;

    // 3. Gắn dữ liệu vào input (để Autocomplete dùng)
    const input = container.querySelector('input');
    if (placeData.lat) {
        input.dataset.placeData = JSON.stringify(placeData);
    }

    // 4. Kích hoạt Autocomplete
    if (typeof setupAutocomplete === 'function') {
        setupAutocomplete(input, (newData, el) => {
            // Khi chọn xong, gọi callback để Map cập nhật
            onUpdate(index, newData);
        });
    }

    // 5. Xử lý nút xóa
    if (isRemovable) {
        const btn = container.querySelector('.remove-wp-btn');
        btn.onclick = () => onRemove(index);
    }

    return container;
}

// [AUTO CSS] Inject thêm style cho các thành phần mới
(function injectRouteStyles() {
    const css = `
        .route-row {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 6px 0;
            position: relative;
        }
        .waypoint-icon {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            color: white;
            font-weight: bold;
            font-size: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        }
        .map-input {
            flex: 1;
            border: 1px solid #ddd;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 14px;
            outline: none;
            transition: border-color 0.2s;
        }
        .map-input:focus {
            border-color: #3C7363;
        }
        .remove-wp-btn {
            background: none;
            border: none;
            color: #999;
            font-size: 20px;
            cursor: pointer;
            padding: 0 5px;
            line-height: 1;
        }
        .remove-wp-btn:hover {
            color: #ea4335;
        }
        /* Nút thêm điểm đến */
        .add-stop-container {
            padding-left: 34px; /* Thụt vào thẳng hàng với input */
            margin-top: 5px;
        }
        .add-stop-btn {
            background: none;
            border: none;
            color: #3C7363;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 5px;
        }
        .add-stop-btn:hover {
            text-decoration: underline;
        }
    `;
    const style = document.createElement('style');
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
})();