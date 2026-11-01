// Инициализируем SDK Telegram WebApp
const tg = window.Telegram.WebApp;
tg.expand(); // Раскрываем приложение на весь экран телефона

// ПОСТАВЬ СЮДА СВОЙ URL ПОСЛЕ ДЕПЛОЯ НА PYTHONANYWHERE!
// Пока тестируешь локально, оставь пустую строку "" или "http://127.0.0.1:8000"
const BACKEND_URL = "https://pythonanywhere.com"; 

// Отображаем юзернейм игрока из Телеграма в левом нижнем углу
if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
    const username = tg.initDataUnsafe.user.username || tg.initDataUnsafe.user.first_name;
    document.getElementById('player-name').innerText = `@${username}`;
}

let localUserData = null;
let cooldownInterval = null;

// Функция загрузки профиля и обновления интерфейса
async function loadProfile() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/profile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData: tg.initData })
        });
        const data = await response.json();
        localUserData = data;
        
        // Обновляем монеты и шкалу лояльности
        document.getElementById('balance-value').innerText = data.points;
        document.getElementById('affinity-text').innerText = data.affinity_label;
        document.getElementById('affinity-fill').style.width = `${data.affinity}%`;
        
        // Запускаем таймер кулдауна и проверяем вопросы
        startCooldownTimer(data.remaining_seconds);
        checkActiveLoyaltyQuestion(data.active_question);
    } catch (error) {
        console.error("Ошибка загрузки профиля:", error);
    }
}
// Таймер обратного отсчета для бесплатной карты
function startCooldownTimer(seconds) {
    clearInterval(cooldownInterval);
    const placeholder = document.getElementById('zone-placeholder');
    const dropZone = document.getElementById('drop-zone');
    
    // Если время вышло — карта доступна
    if (seconds <= 0) {
        document.getElementById('time-left').innerText = "00ч 00м 00с";
        placeholder.innerText = "Жми на круг, чтобы достать карту!";
        dropZone.style.cursor = 'pointer';
        dropZone.onclick = openFreePack;
        return;
    }

    // Если кулдаун идет — круг не кликабелен
    dropZone.onclick = null;
    dropZone.style.cursor = 'default';

    let currentSec = seconds;
    cooldownInterval = setInterval(() => {
        if (currentSec <= 0) {
            clearInterval(cooldownInterval);
            loadProfile(); // Перезагружаем профиль, когда таймер дошел до 0
            return;
        }
        currentSec--;
        
        let hrs = Math.floor(currentSec / 3600);
        let mins = Math.floor((currentSec % 3600) / 60);
        let secs = currentSec % 60;
        
        document.getElementById('time-left').innerText = 
            `${String(hrs).padStart(2,'0')}ч ${String(mins).padStart(2,'0')}м ${String(secs).padStart(2,'0')}с`;
        placeholder.innerText = "Время еще не пришло...";
    }, 1000);
}

// Запрос на вытягивание бесплатной карты
async function openFreePack() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/open-pack`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData: tg.initData })
        });
        const result = await response.json();
        
        if (result.error) {
            tg.showAlert(result.error);
            return;
        }
        
        showDroppedCard(result.card); // Показываем модалку с картой
        loadProfile(); // Обновляем таймер в UI
    } catch (e) {
        tg.showAlert("Не удалось открыть карту. Попробуй позже.");
    }
}
// Анимация всплывающего окна новой карты
function showDroppedCard(card) {
    const modal = document.getElementById('card-modal');
    const space = document.getElementById('modal-card-space');
    
    space.innerHTML = `
        <div class="card-container modal-view">
            <div class="card-inner">
                <div class="card-back">
                    <img src="${card.image_url}" class="card-image-bg">
                    <div class="card-content">
                        <div class="card-title">${card.title}</div>
                        <div class="card-rarity">${card.rarity.toUpperCase()}</div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    modal.style.display = 'flex';
    setTimeout(() => modal.style.opacity = '1', 10);
    
    document.getElementById('btn-modal-keep').onclick = () => {
        modal.style.opacity = '0';
        setTimeout(() => modal.style.display = 'none', 400);
    };
    
    document.getElementById('btn-modal-burn').onclick = async () => {
        const res = await fetch(`${BACKEND_URL}/api/scrap-card/${card.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData: tg.initData })
        });
        const burnRes = await res.json();
        if (burnRes.success) {
            if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success'); // Легкая вибрация телефона
            modal.style.opacity = '0';
            setTimeout(() => modal.style.display = 'none', 400);
            loadProfile();
        }
    };
}

// Покупка -1 часа времени
document.getElementById('btn-buy-hour').onclick = async () => {
    const hourglass = document.getElementById('hourglass-img');
    hourglass.classList.add('flip-hourglass'); // Запускаем CSS анимацию вращения часиков
    setTimeout(() => hourglass.classList.remove('flip-hourglass'), 1000);

    const response = await fetch(`${BACKEND_URL}/api/buy-cooldown`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: tg.initData })
    });
    const result = await response.json();
    if (result.error) tg.showAlert(result.error);
    else loadProfile();
};

// Проверка и генерация инлайн-опросов лояльности
function checkActiveLoyaltyQuestion(question) {
    const bubble = document.getElementById('bot-bubble');
    const optionsZone = document.getElementById('quiz-options');
    
    if (!question) {
        optionsZone.style.display = 'none';
        return;
    }
    
    bubble.innerText = question.question_text;
    optionsZone.innerHTML = `
        <button class="btn-quiz-inline" id="loy-a">${question.button_a}</button>
        <button class="btn-quiz-inline" id="loy-b">${question.button_b}</button>
    `;
    optionsZone.style.display = 'flex';
    
    document.getElementById('loy-a').onclick = () => sendLoyaltyAnswer(question.id, 'a');
    document.getElementById('loy-b').onclick = () => sendLoyaltyAnswer(question.id, 'b');
}

async function sendLoyaltyAnswer(qId, choice) {
    const response = await fetch(`${BACKEND_URL}/api/answer-loyalty`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: tg.initData, question_id: qId, choice })
    });
    const result = await response.json();
    document.getElementById('bot-bubble').innerText = result.reply;
    loadProfile();
}

// Показ экрана "Моя колода"
document.getElementById('btn-open-deck').onclick = async () => {
    const response = await fetch(`${BACKEND_URL}/api/collection?initData=${encodeURIComponent(tg.initData)}`);
    const cards = await response.json();
    
    const grid = document.getElementById('deck-grid');
    grid.innerHTML = '';
    document.getElementById('deck-count').innerText = `${cards.length} шт.`;
    
    cards.forEach(item => {
        grid.innerHTML += `
            <div class="card-container">
                <div class="card-inner">
                    <div class="card-back">
                        <img src="${item.cards.image_url}" class="card-image-bg">
                        <div class="card-content">
                            <div class="card-title">${item.cards.title}</div>
                        </div>
                        <div class="card-badge">x${item.quantity}</div>
                    </div>
                </div>
            </div>
        `;
    });
    
    const screen = document.getElementById('deck-screen');
    screen.style.display = 'flex';
    setTimeout(() => screen.style.opacity = '1', 10);
};

document.getElementById('btn-close-deck').onclick = () => {
    const screen = document.getElementById('deck-screen');
    screen.style.opacity = '0';
    setTimeout(() => screen.style.display = 'none', 300);
};

// Первый запуск при открытии Mini App
loadProfile();
