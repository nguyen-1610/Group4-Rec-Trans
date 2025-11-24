// Biến toàn cục để theo dõi số sao đã chọn
let selectedRating = 0;
const starInputs = document.querySelectorAll('.star-input');
const ratingValue = document.getElementById('ratingValue');

document.addEventListener('DOMContentLoaded', function() {
    // Chỉ cần thêm hiệu ứng hover cho các review đã được Python render sẵn
    addHoverEffectToReviews();
});

// --- 1. XỬ LÝ CHỌN SAO (STAR RATING) ---

starInputs.forEach((star, index) => {
    // Khi di chuột vào: Sáng sao tạm thời
    star.addEventListener('mouseenter', function() {
        highlightStars(index + 1);
    });
    
    // Khi bấm chuột: Lưu số sao đã chọn
    star.addEventListener('click', function() {
        selectedRating = index + 1;
        ratingValue.value = selectedRating; // Cập nhật vào input ẩn nếu cần submit form truyền thống
        selectStars(selectedRating);
    });
});

// Khi chuột rời khỏi vùng chọn sao
document.getElementById('starRating').addEventListener('mouseleave', function() {
    if (selectedRating > 0) {
        // Nếu đã chọn rồi thì hiển thị lại số sao đã chọn
        selectStars(selectedRating);
    } else {
        // Nếu chưa chọn thì tắt hết
        clearStars();
    }
});

function highlightStars(count) {
    starInputs.forEach((star, index) => {
        if (index < count) {
            star.textContent = '★';
            star.classList.add('hover');
        } else {
            star.textContent = '☆';
            star.classList.remove('hover');
        }
    });
}

function selectStars(count) {
    starInputs.forEach((star, index) => {
        if (index < count) {
            star.textContent = '★';
            star.classList.add('selected');
        } else {
            star.textContent = '☆';
            star.classList.remove('selected');
        }
    });
}

function clearStars() {
    starInputs.forEach(star => {
        star.textContent = '☆';
        star.classList.remove('hover', 'selected');
    });
}

// --- 2. XỬ LÝ GỬI FORM VỀ PYTHON (BACKEND) ---

document.getElementById('reviewForm').addEventListener('submit', function(e) {
    e.preventDefault(); // Chặn hành động load lại trang mặc định

    const userName = document.getElementById('userName').value;
    const reviewText = document.getElementById('reviewText').value;
    const rating = selectedRating;
    
    // Validate cơ bản
    if (rating === 0) {
        alert('Vui lòng chọn số sao đánh giá!');
        return;
    }

    // Hiệu ứng nút bấm để người dùng biết đang xử lý
    const submitBtn = document.querySelector('.submit-button');
    const originalBtnText = submitBtn.textContent;
    submitBtn.textContent = "Đang gửi...";
    submitBtn.disabled = true;
    
    // Gửi dữ liệu bằng Fetch API
    fetch('/api/submit-review', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            name: userName,
            rating: rating,
            text: reviewText
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Hiển thị thông báo thành công
            showSuccessMessage();
            
            // Reset form
            document.getElementById('reviewForm').reset();
            selectedRating = 0;
            clearStars();
            
            // Chờ 1.5 giây rồi chuyển hướng về Trang chủ để xem kết quả
            setTimeout(() => {
                window.location.href = "/"; 
            }, 1500);
        } else {
            alert('Có lỗi xảy ra: ' + (data.message || 'Không thể lưu đánh giá'));
            submitBtn.textContent = originalBtnText;
            submitBtn.disabled = false;
        }
    })
    .catch((error) => {
        console.error('Error:', error);
        alert("Có lỗi kết nối đến server.");
        submitBtn.textContent = originalBtnText;
        submitBtn.disabled = false;
    });
});

// --- 3. CÁC HÀM TIỆN ÍCH GIAO DIỆN ---

function showSuccessMessage() {
    // Tạo thông báo
    const message = document.createElement('div');
    message.className = 'success-message';
    message.textContent = '✓ Cảm ơn bạn! Đang chuyển về trang chủ...';
    
    // Chèn thông báo vào sau form
    const formCard = document.querySelector('.review-form-card');
    if (formCard) {
        formCard.insertAdjacentElement('afterend', message);
    }
}

function addHoverEffectToReviews() {
    const reviewItems = document.querySelectorAll('.review-item');
    
    reviewItems.forEach(item => {
        item.addEventListener('mouseenter', function() {
            this.style.transform = 'translateX(5px)';
            this.style.transition = 'transform 0.3s ease';
        });
        
        item.addEventListener('mouseleave', function() {
            this.style.transform = 'translateX(0)';
        });
    });
}