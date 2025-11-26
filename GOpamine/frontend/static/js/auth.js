const API_BASE = 'http://127.0.0.1:5000';

document.addEventListener('DOMContentLoaded', function() {
    console.log(">>> AUTH JS LOADED. TARGET:", API_BASE);

    // ... (Giữ Translation và Toggle Password) ...

    // --- HÀM GỌI API CHUNG (ĐỂ TRÁNH LẶP CODE & BẮT LỖI TỐT HƠN) ---
    async function callAuthAPI(url, data, btn, successMsg) {
        const oldText = btn.textContent;
        btn.textContent = "Đang xử lý...";
        btn.disabled = true;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            // Kiểm tra mã lỗi HTTP
            if (!response.ok) {
                const text = await response.text(); // Đọc text lỗi (HTML hoặc JSON lỗi)
                console.error("Server Error Body:", text);
                throw new Error(`Server Error: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();

            if (result.success) {
                if (successMsg) alert(successMsg);
                window.location.href = result.redirect_url || '/';
            } else {
                // Hiển thị chính xác message từ server gửi về
                alert("Thất bại: " + (result.message || "Lỗi không xác định"));
            }

        } catch (error) {
            console.error("Network/Logic Error:", error);
            alert("Lỗi hệ thống: " + error.message + "\nHãy kiểm tra Terminal của Python để xem chi tiết.");
        } finally {
            btn.textContent = oldText;
            btn.disabled = false;
        }
    }

    // 1. ĐĂNG KÝ
    const registerForm = document.querySelector('form');
    const isRegisterPage = document.getElementById('fullName');

    if (registerForm && isRegisterPage) {
        registerForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const fullName = document.getElementById('fullName').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const confirm = document.getElementById('confirmPassword').value;
            
            if (password !== confirm) { alert("Mật khẩu không khớp!"); return; }

            callAuthAPI(
                `${API_BASE}/api/register`, 
                { fullName, email, password }, 
                registerForm.querySelector('.submit-btn'),
                "Đăng ký thành công! Đăng nhập ngay."
            );
        });
    }

    // 2. ĐĂNG NHẬP
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            callAuthAPI(
                `${API_BASE}/api/login`, 
                { email, password }, 
                loginForm.querySelector('.submit-btn'),
                null // Không cần alert khi login thành công
            );
        });
        
        const link = document.querySelector('.already-account a');
        if(link) link.textContent = "Chưa có tài khoản? Đăng ký.";
    }

    // 3. KHÁCH
    const guestBtn = document.querySelector('[data-i18n="guestLogin"]');
    if (guestBtn) {
        guestBtn.addEventListener('click', function(e) {
            e.preventDefault();
            callAuthAPI(
                `${API_BASE}/api/login-guest`, 
                {}, 
                guestBtn,
                null
            );
        });
    }
});