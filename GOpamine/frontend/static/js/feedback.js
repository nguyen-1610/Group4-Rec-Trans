let selectedRating = 0;
const starInputs = document.querySelectorAll('.star-input');
const ratingValue = document.getElementById('ratingValue');

document.addEventListener('DOMContentLoaded', function() {
    loadReviews();
    addHoverEffectToReviews();
});

function loadReviews() {
    const reviews = getReviewsFromMemory();
    const reviewsList = document.getElementById('reviewsList');
    
    const defaultReviews = reviewsList.innerHTML;
    reviewsList.innerHTML = '';

    reviews.forEach(review => {
        const reviewHTML = createReviewHTML(
            review.name, 
            review.rating, 
            review.text, 
            review.date
        );
        reviewsList.insertAdjacentHTML('beforeend', reviewHTML);
    });
    
    if (reviews.length === 0) {
        reviewsList.innerHTML = defaultReviews;
    }
}

function getReviewsFromMemory() {
    const reviews = [];
    let index = 0;
    
    while (true) {
        const name = localStorage.getItem(`review_${index}_name`);
        if (!name) break;
        
        reviews.push({
            name: name,
            rating: parseInt(localStorage.getItem(`review_${index}_rating`)),
            text: localStorage.getItem(`review_${index}_text`),
            date: localStorage.getItem(`review_${index}_date`)
        });
        index++;
    }
    
    return reviews;
}

function saveReviewToMemory(name, rating, text) {
    const reviews = getReviewsFromMemory();
    const date = new Date().toLocaleString('vi-VN');

    reviews.unshift({ name, rating, text, date });

    const maxReviews = 20;
    if (reviews.length > maxReviews) {
        reviews.splice(maxReviews);
    }

    localStorage.clear();

    reviews.forEach((review, index) => {
        localStorage.setItem(`review_${index}_name`, review.name);
        localStorage.setItem(`review_${index}_rating`, review.rating);
        localStorage.setItem(`review_${index}_text`, review.text);
        localStorage.setItem(`review_${index}_date`, review.date);
    });
}

starInputs.forEach((star, index) => {
    star.addEventListener('mouseenter', function() {
        highlightStars(index + 1);
    });
    
    star.addEventListener('click', function() {
        selectedRating = index + 1;
        ratingValue.value = selectedRating;
        selectStars(selectedRating);
    });
});

document.getElementById('starRating').addEventListener('mouseleave', function() {
    if (selectedRating > 0) {
        selectStars(selectedRating);
    } else {
        clearStars();
    }
});

function highlightStars(count) {
    starInputs.forEach((star, index) => {
        if (index < count) {
            star.classList.add('hover');
            star.textContent = '★';
        } else {
            star.classList.remove('hover');
            star.textContent = '☆';
        }
    });
}

function selectStars(count) {
    starInputs.forEach((star, index) => {
        if (index < count) {
            star.classList.add('selected');
            star.textContent = '★';
        } else {
            star.classList.remove('selected');
            star.textContent = '☆';
        }
    });
}

function clearStars() {
    starInputs.forEach(star => {
        star.classList.remove('hover', 'selected');
        star.textContent = '☆';
    });
}

document.getElementById('reviewForm').addEventListener('submit', function(e) {
    e.preventDefault();

    const userName = document.getElementById('userName').value;
    const reviewText = document.getElementById('reviewText').value;
    const rating = selectedRating;
    
    if (rating === 0) {
        alert('Vui lòng chọn số sao đánh giá!');
        return;
    }
    
    saveReviewToMemory(userName, rating, reviewText);
    
    loadReviews();

    showSuccessMessage();

    this.reset();
    selectedRating = 0;
    ratingValue.value = '';
    clearStars();

    setTimeout(() => {
        document.querySelector('.reviews-card').scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start' 
        });
    }, 100);

    setTimeout(() => {
        addHoverEffectToReviews();
    }, 200);
});

function createReviewHTML(name, rating, text, date) {
    let starsHTML = '';
    for (let i = 1; i <= 5; i++) {
        if (i <= rating) {
            starsHTML += '<span class="star">★</span>';
        } else {
            starsHTML += '<span class="star empty">★</span>';
        }
    }
    
    const dateDisplay = date ? `<div class="review-date">${date}</div>` : '';
    
    return `
        <div class="review-item">
            <div class="review-header">
                <div class="reviewer-info">
                    <div class="reviewer-name">${name}</div>
                    ${dateDisplay}
                </div>
                <div class="stars">
                    ${starsHTML}
                </div>
            </div>
            <div class="review-text">
                ${text}
            </div>
        </div>
    `;
}

function showSuccessMessage() {
    const message = document.createElement('div');
    message.className = 'success-message';
    message.textContent = '✓ Cảm ơn bạn đã đánh giá! Nhận xét của bạn đã được lưu thành công.';
    
    const formCard = document.querySelector('.review-form-card');
    formCard.insertAdjacentElement('afterend', message);

    setTimeout(() => {
        message.remove();
    }, 5000);
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

function clearAllReviews() {
    if (confirm('Bạn có chắc muốn xóa tất cả đánh giá?')) {
        localStorage.clear();
        loadReviews();
        alert('Đã xóa tất cả đánh giá!');
    }
}