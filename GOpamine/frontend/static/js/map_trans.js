/**
 * MAP TRANS - LOGIC XỬ LÝ BẢN ĐỒ & TÍNH TOÁN PHƯƠNG TIỆN
 * --------------------------------------------------------
 * Chức năng chính:
 * 1. Vẽ bản đồ & lộ trình từ dữ liệu localStorage (do form.js gửi qua).
 * 2. Gọi API Backend (/api/compare-transport) để lấy giá tiền & điểm số AI.
 * 3. Cập nhật giao diện (Card phương tiện) với dữ liệu thực tế.
 * 4. Xử lý các nút bấm (Back, Chọn xe, Chuyển tab).
 */

document.addEventListener('DOMContentLoaded', async function() {
    
    // ================================================================
    // 1. CẤU HÌNH & DỮ LIỆU KHỞI TẠO
    // ================================================================
    
    // Cấu hình tốc độ giả định (fallback khi chưa có API)
    const TRAFFIC_CONFIG = {
        rush_hours: [[7, 9], [16.5, 19]], 
        speeds: {
            motorbike: { rush: 25, normal: 35 },
            car:       { rush: 15, normal: 35 },
            bus:       { rush: 12, normal: 20 },
            walk:      { rush: 4,  normal: 5 }
        }
    };

    // Lấy dữ liệu lộ trình từ Storage
    const storedRoute = getStoredRouteFromStorage();
    
    // Dữ liệu mặc định nếu không có Storage (Dùng để test)
    const FALLBACK_ROUTE = {
        start: { lat: 10.7748, lng: 106.6937, name: 'Tao Đàn' },
        end:   { lat: 10.7626, lng: 106.6964, name: 'NYNA Coffee' },
        distance_km: 2.5
    };

    const mapStart   = storedRoute ? storedRoute.waypoints[0] : FALLBACK_ROUTE.start;
    const mapEnd     = storedRoute ? storedRoute.waypoints[storedRoute.waypoints.length-1] : FALLBACK_ROUTE.end;
    const distanceKm = storedRoute ? storedRoute.distance_km : FALLBACK_ROUTE.distance_km;

    console.log(`📍 Khởi tạo bản đồ với khoảng cách: ${distanceKm}km`);

    // ================================================================
    // 2. KHỞI TẠO BẢN ĐỒ (LEAFLET)
    // ================================================================

    // Tắt zoom mặc định để custom vị trí
    const map = L.map('map', {
        zoomControl: false,
        center: [mapStart.lat, mapStart.lon || mapStart.lng],
        zoom: 14
    });

    // Thêm lớp bản đồ nền (OpenStreetMap)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap', maxZoom: 19
    }).addTo(map);

    // Thêm nút Zoom ở góc dưới phải (UI đẹp hơn)
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Vẽ đường đi (Polyline) và Marker
    if (storedRoute) drawPolylineRoute(map, storedRoute);
    createCustomMarker(map, mapStart.lat, mapStart.lon || mapStart.lng, '#4285f4', 'A', mapStart.name);
    createCustomMarker(map, mapEnd.lat, mapEnd.lon || mapEnd.lng, '#ea4335', 'B', mapEnd.name);

    // ================================================================
    // 3. KẾT NỐI BACKEND (CALL API)
    // ================================================================

    // Bước 1: Reset giao diện về trạng thái "Đang tính..."
    updateAllVehicleCardsDefault(distanceKm);

    // Bước 2: Gọi API tính toán giá tiền & điểm số
    await fetchAndUpdateTransportCosts(distanceKm);

    // Bước 3: Kích hoạt sự kiện click chọn xe
    setupVehicleSelection();
    
    // Bước 4: Auto-select xe đã chọn ở trang trước (nếu có)
    if (storedRoute && storedRoute.vehicle) {
        const card = document.querySelector(`.option-card[data-vehicle="${storedRoute.vehicle.type}"]`);
        if (card) card.click();
    }

    // ================================================================
    // 4. CÁC HÀM LOGIC CHI TIẾT
    // ================================================================

    /**
     * Gọi API Backend để lấy dữ liệu so sánh các phương tiện
     */
    async function fetchAndUpdateTransportCosts(distanceKm) {
        try {
            // Lấy ưu tiên người dùng (Tiết kiệm, Nhanh...)
            let priorities = ['saving', 'speed'];
            try {
                const formData = JSON.parse(localStorage.getItem('formData'));
                if (formData && formData.preferences) {
                    priorities = formData.preferences.map(p => 
                        p.toLowerCase().includes('tiết') ? 'saving' :
                        p.toLowerCase().includes('nhanh') ? 'speed' :
                        p.toLowerCase().includes('an') ? 'safety' : 'comfort'
                    );
                }
            } catch (e) { console.log("⚠️ Không đọc được preferences, dùng mặc định."); }

            console.log(`📡 Gọi API compare-transport...`);

            const response = await fetch('/api/compare-transport', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    distance_km: distanceKm,
                    priorities: priorities,
                    is_student: false 
                })
            });

            const result = await response.json();
            if (result.success && result.data) {
                console.log("✅ API trả về dữ liệu:", result.data);
                updateCardsWithBackendData(result.data, distanceKm);
            }
        } catch (error) {
            console.error("❌ Lỗi gọi API:", error);
        }
    }

    /**
     * Cập nhật giao diện thẻ Card dựa trên dữ liệu Backend trả về
     */
    function updateCardsWithBackendData(backendResults, distanceKm) {
        // Map dữ liệu trả về vào object để dễ truy xuất
        const resultMap = {};
        backendResults.forEach(res => {
            const name = res.mode_name.toLowerCase();
            let type = null;
            
            // Logic mapping tên lỏng lẻo (để bắt dính nhiều biến thể tên)
            if (name.includes('bộ') || name.includes('walk')) type = 'walk';
            else if (name.includes('buýt') || name.includes('bus')) type = 'bus';
            else if (name.includes('máy') || name.includes('bike')) type = 'motorbike';
            else if (name.includes('ô tô') || name.includes('car')) type = 'car';
            
            if (type) resultMap[type] = res;
        });

        // Duyệt qua từng thẻ Card trên HTML để update
        ['motorbike', 'car', 'bus', 'walk'].forEach(type => {
            const card = document.querySelector(`.option-card[data-vehicle="${type}"]`);
            if (!card) return;

            const data = resultMap[type];
            const speedInfo = getVehicleSpeedByTime(type);

            // --- XỬ LÝ DỮ LIỆU HIỂN THỊ ---
            let timeText = "--";
            let priceText = "---";
            let scoreHtml = "";
            let tagsHtml = "";

            // 1. Thời gian
            if (speedInfo.speed > 0) {
                const durationMin = data ? data.duration : Math.round((distanceKm / speedInfo.speed) * 60);
                const h = Math.floor(durationMin / 60);
                const m = durationMin % 60;
                timeText = durationMin > 60 ? `${h}h ${m}p` : `${durationMin} phút`;
                card.classList.remove("disabled-card");
            } else {
                timeText = "Dừng hoạt động";
                card.classList.add("disabled-card");
            }

            // 2. Giá tiền & Điểm số & Nhãn
            if (data) {
                priceText = type === 'walk' ? "Miễn phí" : (data.display_price || data.price_value.toLocaleString() + 'đ');
                
                // Tạo HTML ngôi sao điểm số
                if (data.score) {
                    const color = data.score >= 8 ? "#4caf50" : data.score >= 6 ? "#ff9800" : "#f44336";
                    scoreHtml = `
                        <div class="vehicle-score-new" style="display: flex; align-items: center; justify-content: flex-end; gap: 4px; margin-top: 4px; font-size: 13px; font-weight: bold; color: ${color};">
                            <span style="color: #FFD700; font-size: 16px;">★</span>${data.score}/10
                        </div>`;
                }

                // Tạo HTML các nhãn (Tiết kiệm, Nhanh...)
                if (data.labels) {
                    tagsHtml = data.labels.map(l => 
                        `<span style="font-size:10px; background:#e3f2fd; color:#1565c0; padding:2px 5px; border-radius:3px; margin-right:3px; white-space: nowrap;">${l}</span>`
                    ).join('');
                }
            }

            // --- UPDATE DOM ---
            
            // Cập nhật phần Thông tin (Trái)
            card.querySelector('.vehicle-info p').innerHTML = `
                <span style="font-weight:600; color:#333;">${timeText}</span> 
                <span style="color:#888; margin:0 4px;">•</span> 
                <span style="color:#555;">${distanceKm} km</span>
                <br>
                <div style="margin-top:4px;">${tagsHtml}</div>
                <small style="color:#d93025; font-size:11px; display:block; margin-top:2px;">${speedInfo.note}</small>
            `;
            
            // Cập nhật phần Giá & Điểm (Phải)
            const optionRight = card.querySelector('.option-right');
            const priceEl = optionRight.querySelector('.price');
            priceEl.textContent = priceText;

            // Xóa các element cũ để tránh trùng lặp
            const oldScore = optionRight.querySelector('.vehicle-score-new');
            if (oldScore) oldScore.remove();
            const oldStars = optionRight.querySelector('.stars');
            if (oldStars) oldStars.remove();

            // Chèn điểm số mới
            if (scoreHtml) priceEl.insertAdjacentHTML('afterend', scoreHtml);
            
            // Lưu data vào dataset để dùng khi click chọn
            card.dataset.price = priceText;
            card.dataset.time = timeText;
            if (data) card.dataset.score = data.score;
        });
    }

    // --- CÁC HÀM HỖ TRỢ NHỎ ---

    function updateAllVehicleCardsDefault(distKm) {
        ['motorbike', 'car', 'bus', 'walk'].forEach(type => {
            const card = document.querySelector(`.option-card[data-vehicle="${type}"]`);
            if (card) {
                card.querySelector('.price').textContent = "Đang tính...";
                if (getVehicleSpeedByTime(type).speed === 0) card.classList.add("disabled-card");
            }
        });
    }

    function getVehicleSpeedByTime(type) {
        const h = new Date().getHours();
        const cfg = TRAFFIC_CONFIG.speeds[type];
        
        if (type === 'bus' && (h >= 21 || h < 5)) return { speed: 0, note: 'Ngưng hoạt động' };
        
        const isRush = TRAFFIC_CONFIG.rush_hours.some(([s, e]) => h >= s && h < e);
        if (isRush) return { speed: cfg.rush, note: 'Kẹt xe' };
        return { speed: cfg.normal, note: '' };
    }

    function getStoredRouteFromStorage() {
        try { return JSON.parse(localStorage.getItem('selectedRoute')); } catch (e) { return null; }
    }

    function drawPolylineRoute(map, route) {
        if (!route.route_coordinates) return;
        const latlngs = route.route_coordinates.map(c => [c[1], c[0]]);
        L.polyline(latlngs, { color: '#4285f4', weight: 6 }).addTo(map);
        map.fitBounds(L.polyline(latlngs).getBounds(), { padding: [50, 50] });
    }

    function createCustomMarker(map, lat, lng, color, label, popup) {
        const icon = L.divIcon({
            html: `<div style="background:${color}; color:white; width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid white; box-shadow:0 2px 5px rgba(0,0,0,0.3); font-weight:bold;">${label}</div>`,
            className: '', iconSize: [30, 30], iconAnchor: [15, 15]
        });
        L.marker([lat, lng], { icon }).addTo(map).bindPopup(popup);
    }

    function setupVehicleSelection() {
        document.querySelectorAll('.option-card').forEach(card => {
            card.addEventListener('click', function() {
                if (this.classList.contains('disabled-card')) {
                    alert("Phương tiện này hiện không hoạt động!"); return;
                }
                document.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
                this.classList.add('selected');
            });
        });
    }
});

// ================================================================
// 5. CÁC HÀM GLOBAL (EXPOSED TO HTML)
// ================================================================

/**
 * Xử lý chuyển Tab (Map <-> AI)
 * Hỗ trợ 2 kiểu gọi: onclick="switchTab('ai')" hoặc onclick="switchTab(event, 'ai')"
 */
window.switchTab = function(arg1, arg2) {
    let tabName = '';
    if (typeof arg1 === 'string') tabName = arg1;
    else if (typeof arg2 === 'string') tabName = arg2;

    console.log("🖱️ Chuyển tab:", tabName);

    if (tabName === 'ai' || tabName === 'chatbot') {
        window.location.href = '/chatbot';
    } else {
        console.log("Đang ở trang Map");
    }
};

/**
 * Xử lý nút "Chọn" phương tiện
 */
window.confirmRoute = function() {
    const card = document.querySelector('.option-card.selected');
    
    if (!card) {
        alert("Vui lòng chọn một phương tiện để di chuyển!");
        return;
    }
    
    // Lưu thông tin lựa chọn
    const choice = {
        type: card.dataset.vehicle,
        price: card.dataset.price,
        time: card.dataset.time,
        score: card.dataset.score
    };
    localStorage.setItem('finalChoice', JSON.stringify(choice));
    
    // Xác nhận và chuyển trang
    const msg = `✅ XÁC NHẬN LỘ TRÌNH:\n\n- Phương tiện: ${choice.type}\n- Giá dự kiến: ${choice.price}\n- Thời gian: ${choice.time}\n\nBạn muốn chốt đơn và gặp Trợ lý ảo ngay?`;
    if(confirm(msg)) {
        window.location.href = '/chatbot';
    }
};

// Nút Back (Góc trái trên)
window.goToPreviousPage = function() {
    window.location.href = '/form';
};

// Nút "Tư vấn" (Màu xanh nhạt)
window.goBack = function() {
    window.location.href = '/chatbot';
};