document.addEventListener('DOMContentLoaded', () => {
    const originInput = document.getElementById('origin-input');
    const dropdown = document.getElementById('origin-dropdown');
    const gpsBtn = document.getElementById('btn-use-gps');

    if (!originInput || !dropdown || !gpsBtn) return;

    originInput.addEventListener('focus', () => {
        dropdown.classList.remove('hidden');
    });

    // 2. ẨN MENU KHI CLICK RA NGOÀI
    document.addEventListener('click', (e) => {
        if (!originInput.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    });

    // 3. XỬ LÝ LẤY GPS & DỊCH TÊN ĐƯỜNG
    gpsBtn.addEventListener('click', () => {
        if (!navigator.geolocation) {
            alert("Trình duyệt không hỗ trợ định vị.");
            return;
        }

        // UX: Loading
        const icon = gpsBtn.querySelector('.icon');
        const mainText = gpsBtn.querySelector('.main');
        const subText = gpsBtn.querySelector('.sub');
        const originalIcon = icon.innerText;

        icon.innerText = '⏳';
        icon.classList.add('spinning');
        mainText.innerText = "Đang lấy tọa độ...";
        // subText.innerText = "Vui lòng chờ giây lát";

        navigator.geolocation.getCurrentPosition(
            // === LẤY GPS THÀNH CÔNG ===
            async (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;

                console.log(`✅ GPS Found: ${lat}, ${lng}`);

                // Bước đệm: Lưu tọa độ ngay lập tức (phòng trường hợp API lỗi)
                originInput.dataset.lat = lat;
                originInput.dataset.lng = lng;
                
                // UX: Báo đang dịch tên đường
                // mainText.innerText = "Đang tìm địa chỉ...";
                // originInput.value = `Vui lòng chờ trong giây lát...`;

                try {
                    // === GỌI API OPENSTREETMAP (NOMINATIM) ===
                    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
                    
                    const response = await fetch(url, {
                        headers: {
                            // Nominatim yêu cầu User-Agent để tránh bị chặn
                            'User-Agent': 'GOpamine-App/1.0' 
                        }
                    });

                    if (!response.ok) throw new Error('Lỗi kết nối Nominatim');

                    const data = await response.json();
                    console.log("🏠 Address Data:", data);

                    // Xử lý tên đường cho ngắn gọn
                    // Nominatim trả về rất dài, ta ưu tiên lấy: Số nhà + Đường, Phường/Quận
                    const addr = data.address;
                    let displayName = "";

                    // Logic ghép chuỗi thông minh
                    const road = addr.road || addr.pedestrian || "";
                    const number = addr.house_number || "";
                    const suburb = addr.suburb || addr.quarter || ""; // Phường
                    const district = addr.city_district || addr.district || ""; // Quận
                    const city = addr.city || addr.state || ""; // Thành phố

                    if (road) {
                        displayName = number ? `${number} ${road}` : road;
                        if (suburb) displayName += `, ${suburb}`;
                        if (district) displayName += `, ${district}`;
                    } else {
                        // Nếu không tìm thấy tên đường cụ thể, lấy tên hiển thị chung
                        displayName = data.display_name.split(',').slice(0, 3).join(',');
                    }

                    // Cập nhật vào ô Input
                    originInput.value = `📍 ${displayName}`;

                } catch (error) {
                    console.error("Lỗi lấy tên đường:", error);
                    // Nếu lỗi API thì fallback về hiển thị tọa độ
                    originInput.value = `📍 Vị trí của tôi (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
                } finally {
                    // Dọn dẹp giao diện
                    dropdown.classList.add('hidden');
                    resetBtn();
                }
            },
            // === LẤY GPS THẤT BẠI ===
            (error) => {
                console.error(error);
                resetBtn();
                let msg = "Không thể lấy vị trí.";
                if (error.code === 1) msg = "Vui lòng cấp quyền truy cập vị trí.";
                alert(msg);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );

        function resetBtn() {
            icon.innerText = originalIcon;
            icon.classList.remove('spinning');
            mainText.innerText = "Sử dụng vị trí hiện tại";
            subText.innerText = "Nhấn để lấy tọa độ GPS";
        }
    });
});