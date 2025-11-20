const chatInput = document.querySelector('.chat-input');
const sendBtn = document.querySelector('.send-btn');
const chatContainer = document.querySelector('.chat-container');
const addBtn = document.querySelector('.add-btn');
const suggestionsContainer = document.querySelector('.suggestions-container');
const suggestionBtns = document.querySelectorAll('.suggestion-btn');

// Lưu session ID
let sessionId = null;

// Tạo session khi load trang
async function initSession() {
    try {
        const response = await fetch('http://localhost:5000/api/session', {
            method: 'POST'
        });
        const data = await response.json();
        sessionId = data.session_id;
        console.log('Session created:', sessionId);
    } catch (error) {
        console.error('Error creating session:', error);
    }
}

// Gọi khi load trang
initSession();

// Toggle suggestions
addBtn.addEventListener('click', () => {
    suggestionsContainer.classList.toggle('active');
    addBtn.classList.toggle('active');
});

// Handle suggestion button clicks
suggestionBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        chatInput.value = btn.textContent;
        suggestionsContainer.classList.remove('active');
        addBtn.classList.remove('active');
        chatInput.focus();
    });
});

async function sendMessage() {
    const message = chatInput.value.trim();
    if (message === '' || !sessionId) return;

    // Thêm tin nhắn người dùng
    const userMessage = document.createElement('div');
    userMessage.className = 'user-message';
    userMessage.innerHTML = `<div class="user-bubble">${message}</div>`;
    chatContainer.appendChild(userMessage);

    // Xóa nội dung input
    chatInput.value = '';

    // Cuộn xuống cuối
    chatContainer.scrollTop = chatContainer.scrollHeight;

    try {
        // Gửi request đến backend
        const response = await fetch('http://localhost:5000/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                session_id: sessionId,
                message: message
            })
        });

        const data = await response.json();

        // Hiển thị response từ bot
        const botMessage = document.createElement('div');
        botMessage.className = 'bot-message';
        botMessage.innerHTML = `
            <div class="bot-avatar">🤖</div>
            <div class="message-bubble">${data.response}</div>
        `;
        chatContainer.appendChild(botMessage);
        chatContainer.scrollTop = chatContainer.scrollHeight;

    } catch (error) {
        console.error('Error sending message:', error);
        
        // Hiển thị lỗi
        const errorMessage = document.createElement('div');
        errorMessage.className = 'bot-message';
        errorMessage.innerHTML = `
            <div class="bot-avatar">🤖</div>
            <div class="message-bubble">Xin lỗi, đã có lỗi xảy ra. Vui lòng thử lại!</div>
        `;
        chatContainer.appendChild(errorMessage);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
}

sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});