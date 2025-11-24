// Login page specific translations - extend base translations
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

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Update language for login page specific translations
    // Wait a bit to ensure base.html translations are loaded
    setTimeout(function() {
        if (typeof changeLanguage === 'function' && typeof getCurrentLanguage === 'function') {
            changeLanguage(getCurrentLanguage());
        }
    }, 100);

    // Password toggle functionality
    document.querySelectorAll('.toggle-password').forEach(function(toggle) {
        toggle.addEventListener('click', function() {
            // Lấy input tương ứng từ data-target attribute hoặc tìm input password gần nhất
            const targetId = this.getAttribute('data-target');
            let passwordInput = null;
            
            if (targetId) {
                passwordInput = document.getElementById(targetId);
            } else {
                // Nếu không có data-target, tìm input password trong cùng input-wrapper
                const inputWrapper = this.closest('.input-wrapper');
                if (inputWrapper) {
                    passwordInput = inputWrapper.querySelector('input[type="password"], input[type="text"]');
                }
            }
            
            if (passwordInput) {
                // Toggle giữa password và text
                if (passwordInput.type === 'password') {
                    passwordInput.type = 'text';
                    // Đổi icon từ eye-slash sang eye
                    this.classList.remove('fa-eye-slash');
                    this.classList.add('fa-eye');
                } else {
                    passwordInput.type = 'password';
                    // Đổi icon từ eye sang eye-slash
                    this.classList.remove('fa-eye');
                    this.classList.add('fa-eye-slash');
                }
            }
        });
    });
    
    // Social login handlers (for login page)
    const facebookBtn = document.getElementById('facebookLogin');
    const googleBtn = document.getElementById('googleLogin');
    
    if (facebookBtn) {
        facebookBtn.addEventListener('click', function() {
            // Add Facebook login logic here
            console.log('Facebook login clicked');
        });
    }
    
    if (googleBtn) {
        googleBtn.addEventListener('click', function() {
            // Add Google login logic here
            console.log('Google login clicked');
        });
    }
    
    // Form submission handlers
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            // Add form validation and submission logic here
            // e.preventDefault(); // Uncomment if handling with AJAX
        });
    }

});

