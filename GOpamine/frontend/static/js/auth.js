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
                // --- [LOGIC MỚI] PHÂN LOẠI HÀNH ĐỘNG DỰA VÀO successMsg ---
                
                if (successMsg) {
                    // TRƯỜNG HỢP 1: ĐĂNG KÝ (Có tin nhắn thông báo)
                    Swal.fire({
                        title: 'Đăng ký thành công!',
                        text: successMsg,           // Dùng tin nhắn được truyền vào
                        icon: 'success',
                        timer: 2000,
                        showConfirmButton: false,
                        backdrop: `rgba(0,0,0,0.4)`
                    }).then(() => {
                        window.location.href = "/login"; // Chuyển về trang đăng nhập
                    });
                } else {
                    // TRƯỜNG HỢP 2: ĐĂNG NHẬP (successMsg là null)
                    Swal.fire({
                        title: 'Đăng nhập thành công!',
                        text: 'Đang chuyển hướng về trang chủ...',
                        icon: 'success',
                        timer: 1500,
                        showConfirmButton: false,
                        backdrop: `rgba(0,0,0,0.4)`
                    }).then(() => {
                        // Chuyển về Home (hoặc URL server trả về)
                        window.location.href = result.redirect_url || '/'; 
                    });
                }
                // -------------------------------------------------------
            } else {
                // (Giữ nguyên logic lỗi cũ)
                alert("Lỗi: " + (result.message || "Server không trả về lý do"));
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

    // ============================================================
    // [NÂNG CẤP] XỬ LÝ ĐĂNG NHẬP MẠNG XÃ HỘI (DYNAMIC SIMULATION)
    // ============================================================
    
    // Hàm sinh dữ liệu ngẫu nhiên (Để demo tính năng đa người dùng)
    function generateRandomUser(provider) {
        const randomId = Math.floor(Math.random() * 10000); // Số ngẫu nhiên 0-9999
        const providerName = provider.charAt(0).toUpperCase() + provider.slice(1); // Google/Facebook
        
        return {
            name: `${providerName} User ${randomId}`,      // VD: Google User 4521
            email: `user_${randomId}@${provider}.demo`,    // VD: user_4521@google.demo
            social_id: `${provider}_${randomId}`,          // VD: google_4521
            provider: provider
        };
    }

    const googleBtns = document.querySelectorAll('.google-btn');
    const facebookBtns = document.querySelectorAll('.facebook-btn');

    // Hàm xử lý chung
    async function handleSocialLogin(provider) {
        
        // 1. Sinh dữ liệu người dùng MỚI mỗi lần bấm
        const userData = generateRandomUser(provider);

        // 2. Hiện hộp thoại giả lập "Đang kết nối..."
        let timerInterval;
        Swal.fire({
            title: `Đang kết nối ${provider === 'google' ? 'Google' : 'Facebook'}...`,
            html: `Đang xác thực tài khoản: <b>${userData.email}</b>`,
            timer: 1500,
            timerProgressBar: true,
            didOpen: () => {
                Swal.showLoading();
            },
            willClose: () => {
                clearInterval(timerInterval);
            }
        }).then(async (result) => {
            if (result.dismiss === Swal.DismissReason.timer) {
                try {
                    // 3. Gửi về Backend (Backend sẽ tự tạo User mới vào DB)
                    const response = await fetch(`${API_BASE}/api/login-social`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(userData)
                    });

                    const resData = await response.json();

                    if (resData.success) {
                        Swal.fire({
                            icon: 'success',
                            title: 'Thành công!',
                            text: `Chào mừng ${userData.name}!`,
                            showConfirmButton: false,
                            timer: 1500
                        }).then(() => {
                            window.location.href = '/';
                        });
                    } else {
                        alert("Lỗi Social: " + resData.message);
                    }
                } catch (err) {
                    console.error(err);
                    alert("Lỗi kết nối Social Login.");
                }
            }
        });
    }

    // Gán sự kiện (Giữ nguyên)
    googleBtns.forEach(btn => {
        btn.addEventListener('click', (e) => { e.preventDefault(); handleSocialLogin('google'); });
    });

    facebookBtns.forEach(btn => {
        btn.addEventListener('click', (e) => { e.preventDefault(); handleSocialLogin('facebook'); });
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