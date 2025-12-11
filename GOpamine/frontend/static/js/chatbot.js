const chatInput = document.querySelector('.chat-input');
const sendBtn = document.querySelector('.send-btn');
const chatContainer = document.querySelector('.chat-container');
const addBtn = document.querySelector('.add-btn');
const suggestionsContainer = document.querySelector('.suggestions-container');
const suggestionBtns = document.querySelectorAll('.suggestion-btn');

// Lưu session ID
let sessionId = null;
const CHAT_HISTORY_PREFIX = 'chatHistory:';
let historyKey = null;

// === HÀM HỖ TRỢ ĐA NGÔN NGỮ ===
function getTrans(key) {
    const lang = localStorage.getItem('userLang') || localStorage.getItem('language') || 'vi';
    if (window.translations && window.translations[lang] && window.translations[lang][key]) {
        return window.translations[lang][key];
    }
    return key; // Trả về key gốc nếu không tìm thấy
}

// === HÀM KIỂM TRA ĐĂNG NHẬP ===
function isUserLoggedIn() {
    return document.querySelector('.user-profile-container') !== null;
}

// === HÀM CHỌN NƠI LƯU TRỮ ===
function getStorage() {
    return isUserLoggedIn() ? localStorage : sessionStorage;
}

function getHistoryKey(session) {
    return session ? `${CHAT_HISTORY_PREFIX}${session}` : null;
}

function prepareChatHistory(session, reset = false) {
    historyKey = getHistoryKey(session);
    if (!historyKey) return;
    
    if (reset) {
        getStorage().removeItem(historyKey);
    }
    
    restoreChatHistory();
}

function restoreChatHistory() {
    if (!historyKey) return;
    
    try {
        const storage = getStorage();
        const historyRaw = storage.getItem(historyKey);
        
        if (!historyRaw) return;
        
        const history = JSON.parse(historyRaw);
        history.forEach(entry => {
            if (!entry?.role || !entry?.content) return;
            if (entry.role === 'user') {
                appendUserMessage(entry.content, false);
            } else if (entry.role === 'bot') {
                appendBotMessage(entry.content, false);
            }
        });
    } catch (error) {
        console.warn('Không thể khôi phục lịch sử chat:', error);
    }
}

function persistMessage(role, content) {
    if (!historyKey || !role || typeof content !== 'string') return;
    
    try {
        const storage = getStorage();
        const history = JSON.parse(storage.getItem(historyKey) || '[]');
        history.push({ role, content });
        storage.setItem(historyKey, JSON.stringify(history));
    } catch (error) {
        console.warn('Không thể lưu lịch sử chat:', error);
    }
}

// ========================================
// QUAN TRỌNG: Lấy session ID từ form
// ========================================
async function initSession(forceNew = false) {
    try {
        const existingSessionId = !forceNew ? localStorage.getItem('sessionId') : null;
        
        if (existingSessionId) {
            sessionId = existingSessionId;
            console.log('✅ Sử dụng session cũ:', sessionId);
            prepareChatHistory(sessionId);
            
            const storage = getStorage();
            if (!storage.getItem(getHistoryKey(sessionId))) {
                showWelcomeMessage();
            }
            return true;
        } else {
            console.log('🆕 Tạo session mới...');
            const response = await fetch('/api/session', {
                method: 'POST'
            });
            const data = await response.json();
            sessionId = data.session_id;
            localStorage.setItem('sessionId', sessionId);
            prepareChatHistory(sessionId, true);
            showWelcomeMessage();
            return true;
        }
    } catch (error) {
        console.error('❌ Error creating session:', error);
        return false;
    }
}

async function recreateSession() {
    if (historyKey) getStorage().removeItem(historyKey);
    localStorage.removeItem('sessionId');
    sessionId = null;
    historyKey = null;
    return initSession(true);
}

function showWelcomeMessage() {
    console.log('👋 Chatbot ready');
}

function generateAutoPrompt(formData) {
    // 1. Kiểm tra ngôn ngữ hiện tại
    const lang = localStorage.getItem('userLang') || localStorage.getItem('language') || 'vi';
    const isEn = lang === 'en';

    // 2. Định nghĩa bộ từ vựng (Templates)
    const t = {
        intro: isEn ? "I would like advice on a travel route. " : "Tôi muốn được tư vấn về lộ trình di chuyển. ",
        origin: isEn ? "My starting point is " : "Điểm xuất phát của tôi là ",
        dest_single: isEn ? "I want to go to " : "Tôi muốn đi đến ",
        dest_multi: isEn ? "I want to visit the following places: " : "Tôi muốn đi đến các điểm sau: ",
        budget: isEn ? "Budget: " : "Ngân sách: ",
        currency: isEn ? " VND. " : " VNĐ. ",
        passengers: isEn ? "Passengers: " : "Số khách: ",
        pref: isEn ? "Priorities: " : "Ưu tiên: ",
        closing: isEn 
            ? "Can you suggest suitable transport modes and routes? Please answer in English." 
            : "Bạn có thể tư vấn phương tiện và lộ trình phù hợp không?"
    };

    // 3. Ráp câu (Logic giữ nguyên như cũ)
    let prompt = t.intro;
    
    if (formData.origin) {
        const originName = typeof formData.origin === 'string' ? formData.origin : formData.origin.name || '';
        if (originName) prompt += `${t.origin}${originName}. `;
    }
    
    if (formData.destinations && formData.destinations.length > 0) {
        const destNames = formData.destinations.map(dest => typeof dest === 'string' ? dest : dest.name).filter(Boolean);
        if (destNames.length === 1) prompt += `${t.dest_single}${destNames[0]}. `;
        else if (destNames.length > 1) prompt += `${t.dest_multi}${destNames.join(', ')}. `;
    }
    
    if (formData.budget) {
        prompt += `${t.budget}${parseInt(formData.budget).toLocaleString('vi-VN')}${t.currency}`;
    }
    
    if (formData.passengers) {
        prompt += `${t.passengers}${formData.passengers}. `;
    }
    
    if (formData.preferences && formData.preferences.length > 0) {
        // Lưu ý: Các từ khóa trong preferences có thể vẫn là Tiếng Việt (do lưu từ Form)
        // Nhưng Gemini sẽ tự hiểu được ngữ cảnh này.
        prompt += `${t.pref}${formData.preferences.join(', ')}. `;
    }
    
    prompt += t.closing;
    
    return prompt;
}

async function sendAutoPrompt() {
    try {
        const pendingFormDataStr = localStorage.getItem('pendingFormData');
        if (!pendingFormDataStr) return;
        
        const formData = JSON.parse(pendingFormDataStr);

        // --- LOGIC KIỂM TRA TRÙNG LẶP (FINGERPRINT) ---
        
        // 1. Tạo "chữ ký" cho dữ liệu mới
        // (Đảm bảo bạn đã có hàm generateRouteSignature trong file này)
        const currentSignature = generateRouteSignature(formData);
        
        // 2. Lấy "chữ ký" cũ
        const lastSignature = localStorage.getItem('lastRouteSignature');
        
        // 3. Dọn dẹp dữ liệu chờ (Xóa ngay để tránh xử lý lại nếu user refresh)
        localStorage.removeItem('pendingFormData');

        // 4. SO SÁNH: Nếu giống hệt nhau -> DỪNG (Im lặng)
        if (currentSignature && currentSignature === lastSignature) {
            console.log('🛑 Lộ trình trùng khớp. Không gửi gợi ý lại.');
            return; 
        }

        // 5. Nếu khác -> Lưu chữ ký mới và tiếp tục
        console.log('📋 Lộ trình thay đổi. Gửi gợi ý mới...');
        localStorage.setItem('lastRouteSignature', currentSignature);
        
        // --- TẠO VÀ GỬI PROMPT ---
        
        const autoPrompt = generateAutoPrompt(formData);
        
        // Đợi UI ổn định xíu
        await new Promise(resolve => setTimeout(resolve, 500));
        
        if (sessionId) await sendMessageToBackend(autoPrompt);

    } catch (error) {
        console.error('❌ Error sending auto prompt:', error);
        // Xóa để tránh lỗi lặp lại vô tận
        localStorage.removeItem('pendingFormData');
    }
}

async function sendMessageToBackend(message, allowRetry = true) {
    if (!sessionId || !message) return;
    
    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'bot-message typing-indicator';
    typingIndicator.innerHTML = `
        <div class="bot-avatar"><img src="../static/image/logo.jpg" alt="bot-avatar"></div>
        <div class="message-bubble">${getTrans('status_typing')}</div>
    `;
    chatContainer.appendChild(typingIndicator);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    try {
        console.log('📤 Sending message:', message);
        
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId, message: message })
        });
        
        typingIndicator.remove();
        
        if (!response.ok) {
            let errorDetails = null;
            try { errorDetails = await response.json(); } catch (_) {}

            if (allowRetry && response.status === 400 && errorDetails?.error === 'Invalid session') {
                const recreated = await recreateSession();
                if (recreated) return sendMessageToBackend(message, false);
            }
            throw new Error(`Server error: ${response.status}`);
        }
        
        const data = await response.json();
        appendBotMessage(data.response);
        
    } catch (error) {
        typingIndicator.remove();
        const errorMessage = document.createElement('div');
        errorMessage.className = 'bot-message';
        errorMessage.innerHTML = `
            <div class="bot-avatar"><img src="../static/image/logo.jpg" alt="bot-avatar"></div>
            <div class="message-bubble" style="background: #ffebee; color: #c62828;">❌ Lỗi: ${getTrans('error_prefix')} ${error.message}</div>
        `;
        chatContainer.appendChild(errorMessage);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
}

// Khởi tạo
initSession().then(() => {
    sendAutoPrompt();
});

// UI Events
addBtn.addEventListener('click', () => {
    suggestionsContainer.classList.toggle('active');
    addBtn.classList.toggle('active');
});

suggestionBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        chatInput.value = btn.textContent;
        suggestionsContainer.classList.remove('active');
        addBtn.classList.remove('active');
        chatInput.focus();
    });
});

function scrollChatToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function appendUserMessage(message, persist = true) {
    const userMessage = document.createElement('div');
    userMessage.className = 'user-message';
    userMessage.innerHTML = `<div class="user-bubble">${escapeHtml(message)}</div>`;
    chatContainer.appendChild(userMessage);
    scrollChatToBottom();
    if (persist) persistMessage('user', message);
}

function appendBotMessage(message, persist = true) {
    const botMessage = document.createElement('div');
    botMessage.className = 'bot-message';
    botMessage.innerHTML = `
        <div class="bot-avatar"><img src="../static/image/logo.jpg" alt="bot-avatar"></div>
        <div class="message-bubble">${formatBotResponse(message)}</div>
    `;
    chatContainer.appendChild(botMessage);
    scrollChatToBottom();
    if (persist) persistMessage('bot', message);
}

async function sendMessage() {
    const message = chatInput.value.trim();
    if (message === '' || !sessionId) return;

    appendUserMessage(message);
    chatInput.value = '';
    suggestionsContainer.classList.remove('active');
    addBtn.classList.remove('active');

    await sendMessageToBackend(message);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatBotResponse(rawText) {
    if (!rawText) return '';
    const escaped = escapeHtml(rawText.trim());
    const lines = escaped.split('\n');
    let html = '';
    let listBuffer = [];
    
    const flushList = () => {
        if (listBuffer.length === 0) return;
        html += '<ul>' + listBuffer.map(item => `<li>${formatInlineMarkdown(item)}</li>`).join('') + '</ul>';
        listBuffer = [];
    };
    
    lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed === '') { flushList(); html += '<br>'; return; }
        if (/^[-*]\s+/.test(trimmed)) {
            listBuffer.push(trimmed.replace(/^[-*]\s+/, ''));
            return;
        }
        flushList();
        html += `<p>${formatInlineMarkdown(trimmed)}</p>`;
    });
    
    flushList();
    return html || escaped;
}

function formatInlineMarkdown(text) {
    if (!text) return '';
    return text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
}

sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// Header Navigation
function setupHeaderNavigation() {
    const backBtn = document.querySelector('.back-btn');
    const toggleBtns = document.querySelectorAll('.toggle-btn');
    
    if (backBtn) {
        backBtn.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Gọi hàm với danh sách các trang "con" cần né
            // Nếu user vừa từ 'chatbot' hoặc 'map' quay lại Form, 
            // nút Back này sẽ đưa họ về Home chứ KHÔNG quay lại Chatbot/Map nữa.
            goToPreviousPage('/', ['chatbot', 'confirm']); 
        });
    }
    
    if (toggleBtns.length > 0) {
        toggleBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.target === 'map') window.location.href = '/map_trans';
            });
        });
    }
}
setupHeaderNavigation();

// 1. Đảm bảo hàm này CÓ mặt trong file chatbot.js (hoặc file utils chung)
function goToPreviousPage(fallbackUrl = '/', ignorePaths = []) {
    const currentDomain = window.location.origin;
    const referrer = document.referrer;
    const isInternal = referrer && referrer.indexOf(currentDomain) === 0;
    const isIgnored = ignorePaths.some(path => referrer.includes(path));

    if (isInternal && !isIgnored) {
        window.history.back();
    } else {
        window.location.href = fallbackUrl;
    }
}

// === PROFILE DROPDOWN TOGGLE ===
const profileTrigger = document.getElementById('profileTrigger');
const profileDropdown = document.getElementById('profileDropdown');

if (profileTrigger && profileDropdown) {
    profileTrigger.addEventListener('click', function(e) {
        e.stopPropagation();
        profileDropdown.classList.toggle('active');
    });

    document.addEventListener('click', function(e) {
        if (profileDropdown.classList.contains('active') && !profileDropdown.contains(e.target) && e.target !== profileTrigger) {
            profileDropdown.classList.remove('active');
        }
    });
}

// === LOGOUT FUNCTION ===
async function handleLogout() {
    try {
        const response = await fetch('http://127.0.0.1:5000/api/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });

        const result = await response.json();
        if (result.success) {
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    title: getTrans('logout_success_title'),
                    text: getTrans('logout_success_text'),
                    icon: 'success',
                    timer: 1500,
                    showConfirmButton: false
                }).then(() => window.location.href = '/');
            } else {
                alert('Đăng xuất thành công!');
                window.location.href = '/';
            }
        } else {
            alert('Lỗi: ' + result.message);
        }
    } catch (error) {
        console.error('Logout Error:', error);
    }
}

const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', function(e) {
        e.preventDefault();
        
        const doLogout = () => {
            if (historyKey) localStorage.removeItem(historyKey);
            handleLogout();
        };

        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: getTrans('logout_confirm_title'),
                text: getTrans('logout_confirm_text'),
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#3C7363',
                cancelButtonColor: '#d33',
                confirmButtonText: getTrans('btn_confirm'),
                cancelButtonText: getTrans('btn_cancel')
            }).then((result) => {
                if (result.isConfirmed) doLogout();
            });
        } else {
            if (confirm(getTrans('logout_confirm_text'))) doLogout();
        }
    });
}

// ============================================================
// [KHÔI PHỤC] XỬ LÝ CLICK VÀO PROFILE ICON KHI CHƯA ĐĂNG NHẬP
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    const profileIcon = document.querySelector('.profile-icon');
    
    // Chỉ chạy nếu tìm thấy class .profile-icon (tức là user CHƯA đăng nhập)
    if (profileIcon) {
        profileIcon.style.cursor = 'pointer';
        profileIcon.addEventListener('click', function() {
            console.log("Redirecting to login...");
            window.location.href = '/login';
        });
    }
});

// === HÀM HỖ TRỢ SO SÁNH DỮ LIỆU ===
function generateRouteSignature(formData) {
    if (!formData) return '';

    // 1. Lấy thông tin điểm đi
    let originStr = '';
    if (formData.origin) {
        originStr = typeof formData.origin === 'string' 
            ? formData.origin 
            : `${formData.origin.name}_${formData.origin.lat}_${formData.origin.lon}`;
    }

    // 2. Lấy thông tin điểm đến (nối tất cả lại)
    let destStr = '';
    if (Array.isArray(formData.destinations)) {
        destStr = formData.destinations.map(d => {
            return typeof d === 'string' 
                ? d 
                : `${d.name}_${d.lat}_${d.lon}`;
        }).join('|'); // Dùng dấu gạch đứng để ngăn cách
    }

    // Kết quả: "StartName_10.1_106.2||Dest1_10.3_106.4|Dest2..."
    return `${originStr}||${destStr}`;
}