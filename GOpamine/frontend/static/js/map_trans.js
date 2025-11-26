document.addEventListener('DOMContentLoaded', async function() {
    // ================================================================
    // 1. CẤU HÌNH & MAP (GIỮ NGUYÊN TỪ CODE GỐC)
    // ================================================================
    const TRAFFIC_CONFIG = {
        rush_hours: [[7, 9], [16.5, 19]], 
        off_hours: [[22, 24], [0, 5]], 
        speeds: {
            motorbike: { rush: 25, normal: 35, fast: 45 },
            car:       { rush: 15, normal: 35, fast: 50 },
            bus:       { rush: 12, normal: 20, fast: 35 },
            walk:      { rush: 4,  normal: 5,  fast: 5 }
        }
    };

    // Lấy thông tin lộ trình
    const storedRoute = getStoredRouteFromStorage();
    const FALLBACK_ROUTE = {
        start: { lat: 10.7748, lng: 106.6937, name: 'Tao Đàn' },
        end: { lat: 10.7626, lng: 106.6964, name: 'NYNA Coffee' },
        distance_km: 2.5
    };

    const mapStart = storedRoute ? storedRoute.waypoints[0] : FALLBACK_ROUTE.start;
    const mapEnd = storedRoute ? storedRoute.waypoints[storedRoute.waypoints.length-1] : FALLBACK_ROUTE.end;
    const distanceKm = storedRoute ? storedRoute.distance_km : FALLBACK_ROUTE.distance_km;

    console.log(`📍 Khoảng cách: ${distanceKm}km`);

    // Vẽ Map
    const map = L.map('map').setView([mapStart.lat, mapStart.lon || mapStart.lng], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap', maxZoom: 19
    }).addTo(map);

    if (storedRoute) drawPolylineRoute(map, storedRoute);
    createCustomMarker(map, mapStart.lat, mapStart.lon || mapStart.lng, '#4285f4', 'A', mapStart.name);
    createCustomMarker(map, mapEnd.lat, mapEnd.lon || mapEnd.lng, '#ea4335', 'B', mapEnd.name);

    // ================================================================
    // 2. KẾT NỐI BACKEND MỚI (PHẦN QUAN TRỌNG ⭐)
    // ================================================================
    
    // Reset giao diện trước khi load
    updateAllVehicleCardsDefault(distanceKm);

    // Gọi API Pricing Score từ Backend
    await fetchAndUpdateTransportCosts(distanceKm);

    // Sự kiện click chọn xe
    setupVehicleSelection();
    
    // Active xe đã chọn trước đó
    if (storedRoute && storedRoute.vehicle) {
        const card = document.querySelector(`.option-card[data-vehicle="${storedRoute.vehicle.type}"]`);
        if (card) card.click();
    }

    // ================================================================
    // 3. CÁC HÀM LOGIC (HỢP NHẤT)
    // ================================================================

    // 🔥 HÀM GỌI API
    async function fetchAndUpdateTransportCosts(distanceKm) {
        try {
            // Lấy ưu tiên từ localStorage (do form.js đã lưu)
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
            } catch (e) { console.log("Dùng priority mặc định"); }

            console.log(`📡 Gọi API compare-transport: ${distanceKm}km, ${priorities}`);

            const response = await fetch('/api/compare-transport', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    distance_km: distanceKm,
                    priorities: priorities,
                    is_student: false // Có thể lấy từ formData nếu cần
                })
            });

            const result = await response.json();
            if (result.success && result.data) {
                console.log("✅ Data:", result.data);
                updateCardsWithBackendData(result.data, distanceKm);
            }
        } catch (error) {
            console.error("❌ Lỗi API:", error);
        }
    }

// 🔥 HÀM CẬP NHẬT GIAO DIỆN (ĐÃ FIX: Xóa sao cũ & Đặt điểm dưới giá)
    function updateCardsWithBackendData(backendResults, distanceKm) {
        const resultMap = {};
        backendResults.forEach(res => {
            const name = res.mode_name.toLowerCase();
            let vehicleType = null;
            if (name.includes('bộ') || name.includes('walk')) vehicleType = 'walk';
            else if (name.includes('buýt') || name.includes('bus')) vehicleType = 'bus';
            else if (name.includes('máy') || name.includes('bike')) vehicleType = 'motorbike';
            else if (name.includes('ô tô') || name.includes('car')) vehicleType = 'car';
            
            if (vehicleType) resultMap[vehicleType] = res;
        });

        ['motorbike', 'car', 'bus', 'walk'].forEach(type => {
            const card = document.querySelector(`.option-card[data-vehicle="${type}"]`);
            if (!card) return;

            const data = resultMap[type];
            const speedInfo = getVehicleSpeedByTime(type);

            // 1. THỜI GIAN & QUÃNG ĐƯỜNG
            let timeText = "--";
            let distanceText = `${distanceKm} km`; 
            
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

            // 2. GIÁ TIỀN
            let priceText = "---";
            if (data) {
                priceText = type === 'walk' ? "Miễn phí" : data.display_price || data.price_value.toLocaleString() + 'đ';
            }

            // 3. TẠO HTML ĐIỂM SỐ (1 Ngôi sao + Điểm)
            let scoreHtml = "";
            if (data && data.score) {
                const color = data.score >= 8 ? "#4caf50" : data.score >= 6 ? "#ff9800" : "#f44336";
                
                // Style: Flex canh phải, margin-top để nằm dưới giá
                scoreHtml = `
                    <div class="vehicle-score-new" style="
                        display: flex; 
                        align-items: center; 
                        justify-content: flex-end; 
                        gap: 4px; 
                        margin-top: 4px; 
                        font-size: 13px; 
                        font-weight: bold; 
                        color: ${color};
                    ">
                        <span style="color: #FFD700; font-size: 16px;">★</span>
                        ${data.score}/10
                    </div>
                `;
            }

            // 4. TẠO NHÃN (Tags)
            let tagsHtml = "";
            if (data && data.labels) {
                tagsHtml = data.labels.map(l => 
                    `<span style="font-size:10px; background:#e3f2fd; color:#1565c0; padding:2px 5px; border-radius:3px; margin-right:3px; white-space: nowrap;">${l}</span>`
                ).join('');
            }

            // --- CẬP NHẬT DOM ---
            
            // A. Cập nhật thông tin bên trái (Thời gian + Tags)
            card.querySelector('.vehicle-info p').innerHTML = `
                <span style="font-weight:600; color:#333;">${timeText}</span> 
                <span style="color:#888; margin:0 4px;">•</span> 
                <span style="color:#555;">${distanceText}</span>
                <br>
                <div style="margin-top:4px;">${tagsHtml}</div>
                <small style="color:#d93025; font-size:11px; display:block; margin-top:2px;">${speedInfo.note}</small>
            `;
            
            // B. Cập nhật bên phải (Giá + Điểm)
            const optionRight = card.querySelector('.option-right');
            const priceEl = optionRight.querySelector('.price');
            
            // B1. Gán giá tiền mới
            priceEl.textContent = priceText;

            // B2. TÌM VÀ XÓA 5 NGÔI SAO CŨ (QUAN TRỌNG)
            const oldStars = optionRight.querySelector('.stars');
            if (oldStars) oldStars.remove(); // Xóa vĩnh viễn khỏi HTML lúc chạy

            // B3. Xóa điểm số cũ (nếu hàm chạy lại lần 2)
            const oldScore = optionRight.querySelector('.vehicle-score-new');
            if (oldScore) oldScore.remove();

            // B4. Chèn điểm số mới XUỐNG DƯỚI giá tiền
            if (scoreHtml) {
                priceEl.insertAdjacentHTML('afterend', scoreHtml);
            }
            
            // Lưu data vào thẻ
            card.dataset.price = priceText;
            card.dataset.time = timeText;
        });
    }

    // HÀM UPDATE MẶC ĐỊNH (KHI CHƯA CÓ DATA)
    function updateAllVehicleCardsDefault(distKm) {
        ['motorbike', 'car', 'bus', 'walk'].forEach(type => {
            const card = document.querySelector(`.option-card[data-vehicle="${type}"]`);
            if (card) {
                card.querySelector('.price').textContent = "Đang tính...";
                const status = getVehicleSpeedByTime(type);
                if (status.speed === 0) card.classList.add("disabled-card");
            }
        });
    }

    // Helper Functions (Giữ nguyên)
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

function confirmRoute() {
    const card = document.querySelector('.option-card.selected');
    if (!card) return alert("Vui lòng chọn phương tiện!");
    alert(`✅ ĐÃ CHỐT:\nPhương tiện: ${card.querySelector('h4').textContent}\nGiá: ${card.dataset.price}\nThời gian: ${card.dataset.time}`);
}
function goToPreviousPage() { window.history.back(); }