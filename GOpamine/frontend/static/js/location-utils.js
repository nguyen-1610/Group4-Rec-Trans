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

function getPlaceIcon(type) {
    const iconMap = {'cafe': '☕',
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
		'airport': '✈️'};
    return iconMap[type] || '📍';
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

/**
 * Thiết lập chức năng Autocomplete và Debounce cho ô input tìm kiếm địa điểm.
 * @param {HTMLElement} inputElement - Phần tử input.
 * @param {Function} onPlaceSelected - Callback được gọi khi một địa điểm được chọn: (placeData, inputElement) => void
 * @param {Function} [onInputUpdated] - Callback được gọi khi dữ liệu input thay đổi (ví dụ: lưu form data).
 */
function setupAutocomplete(inputElement, onPlaceSelected, onInputUpdated = () => {}) {
    let suggestionsDiv = inputElement.nextElementSibling;
    
    // 1. Khởi tạo/Tìm kiếm container gợi ý
    if (!suggestionsDiv || !suggestionsDiv.classList.contains('autocomplete-suggestions')) {
        suggestionsDiv = document.createElement('div');
        suggestionsDiv.className = 'autocomplete-suggestions';
        inputElement.parentNode.insertBefore(suggestionsDiv, inputElement.nextSibling);
    }

    // 2. Xử lý sự kiện gõ phím (Input)
    inputElement.addEventListener('input', async (e) => {
        const query = e.target.value.trim();
        
        // Gọi callback để xử lý các hành động phụ (VD: Lưu Form Data)
        onInputUpdated(); 

        // Clear debounce cũ để tránh gọi API liên tục
        clearTimeout(debounceTimer);
        if (query.length < 3) {
            suggestionsDiv.innerHTML = '';
            suggestionsDiv.style.display = 'none';
            return;
        }

        // Gọi API sau 300ms
        debounceTimer = setTimeout(async () => {
            const places = await searchPlacesNominatim(query);
            
            // Truyền hàm callback vào displaySuggestions
            displaySuggestions(suggestionsDiv, places, inputElement, onPlaceSelected);
        }, 300);
    });

    // 3. Xử lý click ra ngoài để ẩn gợi ý
    document.addEventListener('click', (e) => {
        if (!inputElement.contains(e.target) && !suggestionsDiv.contains(e.target)) {
            suggestionsDiv.style.display = 'none';
        }
    });
}


/**
 * Hiển thị danh sách gợi ý và xử lý sự kiện chọn.
 * (Hàm này cũng cần nằm trong gopamine_utils.js)
 * @param {HTMLElement} container
 * @param {Array} places
 * @param {HTMLElement} inputElement
 * @param {Function} onPlaceSelected - Hàm callback khi chọn địa điểm
 */
function displaySuggestions(container, places, inputElement, onPlaceSelected) {
    if (places.length === 0) {
        container.innerHTML = '<div class="suggestion-item no-results">Không tìm thấy kết quả</div>';
        container.style.display = 'block';
        return;
    }
    
    // ... (Giữ nguyên logic tạo HTML) ...

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
    
    // Xử lý sự kiện click
    container.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
            const placeData = JSON.parse(item.dataset.place);
            const shortName = placeData.name.split(',').slice(0, 2).join(',');
            
            // Cập nhật giá trị hiển thị trên input
            inputElement.value = shortName;
            
            // LƯU Ý: Không lưu vào dataset ở đây nữa. Dataset sẽ được lưu/xử lý 
            // bởi hàm callback (onPlaceSelected) để đảm bảo tính linh hoạt.
            
            container.style.display = 'none';
            
            // GỌI HÀM CALLBACK VỚI DỮ LIỆU ĐỊA ĐIỂM ĐÃ CHỌN
            onPlaceSelected(placeData, inputElement);
        });
    });
}

// Giao diện đẹp nên giữ sau này dùng

// function showGpsOptionOnly(box, type, inputElement) {
//     box.innerHTML = '';
//     box.classList.remove('hidden');

//     const div = document.createElement('div');
//     div.className = 'suggestion-item gps-item';
//     div.style.color = '#3C7363';
//     div.style.fontWeight = '500';
//     div.innerHTML = `<i class="fas fa-location-crosshairs"></i> <span>Sử dụng vị trí hiện tại</span>`;
//     div.onclick = () => handleGpsSelectionAdvanced(type, box, inputElement);
    
//     box.appendChild(div);
// }

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

