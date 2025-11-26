const API_BASE = 'http://127.0.0.1:5000';

document.addEventListener('DOMContentLoaded', function() {
    console.log(">>> AUTH JS LOADED. TARGET:", API_BASE);

    // Initialize language
    setTimeout(function() {
        if (typeof changeLanguage === 'function' && typeof getCurrentLanguage === 'function') {
            changeLanguage(getCurrentLanguage());
        }
    }, 100);

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
            
            if (password !== confirm) { 
                alert("Mật khẩu không khớp!"); 
                return; 
            }

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

    // Password toggle functionality
    document.querySelectorAll('.toggle-password').forEach(function(toggle) {
        toggle.addEventListener('click', function() {
            const targetId = this.getAttribute('data-target');
            let passwordInput = null;
            
            if (targetId) {
                passwordInput = document.getElementById(targetId);
            } else {
                const inputWrapper = this.closest('.input-wrapper');
                if (inputWrapper) {
                    passwordInput = inputWrapper.querySelector('input[type="password"], input[type="text"]');
                }
            }
            
            if (passwordInput) {
                if (passwordInput.type === 'password') {
                    passwordInput.type = 'text';
                    this.classList.remove('fa-eye-slash');
                    this.classList.add('fa-eye');
                } else {
                    passwordInput.type = 'password';
                    this.classList.remove('fa-eye');
                    this.classList.add('fa-eye-slash');
                }
            }
        });
    });
});

// Login page specific translations
if (window.translations) {
    window.translations.vi = window.translations.vi || {};
    window.translations.en = window.translations.en || {};
    
    Object.assign(window.translations.vi, {
        title: "Khám phá hành trình",
        subtitle: "hoàn hảo của bạn.",
        fullName: "Họ và Tên",
        fullNamePlaceholder: "Nhập họ và tên",
        email: "Email",
        emailPlaceholder: "Nhập email",
        password: "Mật Khẩu",
        passwordPlaceholder: "Nhập mật khẩu",
        confirmPassword: "Nhập lại mật khẩu",
        confirmPasswordPlaceholder: "Nhập lại mật khẩu",
        or: "Hoặc",
        guestLogin: "Đăng nhập với tài khoản khách",
        signUp: "Đăng Ký",
        login: "Đăng Nhập",
        haveAccount: "Đã có tài khoản."
    });
    
    Object.assign(window.translations.en, {
        title: "Discover Your",
        subtitle: "Perfect Journey.",
        fullName: "Full Name",
        fullNamePlaceholder: "Enter your full name",
        email: "Email",
        emailPlaceholder: "Enter your email",
        password: "Password",
        passwordPlaceholder: "Enter your password",
        confirmPassword: "Confirm Password",
        confirmPasswordPlaceholder: "Confirm your password",
        or: "Or",
        guestLogin: "Login as guest",
        signUp: "Sign Up",
        login: "Login",
        haveAccount: "Already have an account."
    });
}