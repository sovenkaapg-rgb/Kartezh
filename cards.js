const cardsZone = document.getElementById('cards-zone');
const cardModal = document.getElementById('card-modal');
const modalInside = document.getElementById('modal-card-inside');
const deckScreen = document.getElementById('deck-screen');
const deckGrid = document.getElementById('deck-grid');
const deckCountElement = document.getElementById('deck-count');
const botSpeech = document.getElementById('bot-speech');

const BOT_PHRASES = {
    welcome_cooldown: [
        "Время еще не пришло... Возвращайся позже, смертный.",
        "Песок в часах течет слишком медленно для тебя?",
        "Я не дам тебе карты прямо сейчас. Жди."
    ],
    welcome_ready: [
        "Ооо... Карты заждались твоих рук. Испытай удачу.",
        "Твоя судьба готова раскрыться. Выбирай карту.",
        "Чувствуешь этот холод? Пора сделать выбор..."
    ],
    drop_normal: "Обычная безделушка... Ей место в грязи.",
    drop_rare: "Редкая находка. Возможно, в тебе есть потенциал.",
    drop_legendary: "🔥 НЕВЕРОЯТНО! Сама Бездна благоволит тебе сегодня!..",
    drop_duplicate: "Хах, эта карта уже принадлежит тебе. Зачем тебе еще одна?",
    burn_card: "🔥 Пепел к пеплу... Твоя карта сгорела, но карма очищена.",
    buy_hour: "⏳ Ты готов платить золотом за ускорение времени? Забавно..."
};

let ALL_GAME_CARDS = []; 
let userInventory = {}; 
let lastAwardedCard = null; 

const RARITY_COLORS = {
    "обыч": "#888888",
    "редкая": "#3498db",
    "лега": "#e67e22"
};

// СТРОГИЕ ВЕСА ИЗ ТГ БОТА
const RARITY_CHANCES = { 'обыч': 0.799, 'редкая': 0.20, 'лега': 0.001 };
const RARITY_BY_AFFINITY = [
    { threshold: 70, weights: { 'обыч': 0.694, 'редкая': 0.295, 'лега': 0.011 } },
    { threshold: 31, weights: { 'обыч': 0.749, 'редкая': 0.245, 'лега': 0.006 } },
    { threshold: 0, weights: RARITY_CHANCES }
];

function changeBotSpeech(text) {
    if (botSpeech) botSpeech.innerText = text;
}

function getRandomPhrase(phraseArray) {
    return phraseArray[Math.floor(Math.random() * phraseArray.length)];
}

function updateCardsAvailability() {
    if (!cardsZone) return;
    if (cooldownSeconds > 0) {
        cardsZone.innerHTML = '<div class="zone-placeholder">Время еще не пришло...</div>';
        if (!timerInterval) changeBotSpeech(getRandomPhrase(BOT_PHRASES.welcome_cooldown));
    } else {
        if (cardsZone.querySelector('.zone-placeholder') || cardsZone.innerHTML === '') {
            initCards();
            changeBotSpeech(getRandomPhrase(BOT_PHRASES.welcome_ready));
        }
    }
}

// ВЫЧИСЛЕНИЕ РЕДКОСТИ ПО ЛОЯЛЬНОСТИ (КАК В БОТЕ)
function getWeightedRarity(affinity) {
    let activeWeights = RARITY_CHANCES;
    for (const level of RARITY_BY_AFFINITY) {
        if (affinity >= level.threshold) {
            activeWeights = level.weights;
            break;
        }
    }
    const rand = Math.random();
    let cumulative = 0;
    for (const [rarity, chance] of Object.entries(activeWeights)) {
        cumulative += chance;
        if (rand <= cumulative) return rarity;
    }
    return 'обыч';
}

// ИЛЛЮЗИЯ ВЫБОРА: 3 карты на экране
function initCards() {
    if (!cardsZone || ALL_GAME_CARDS.length === 0) return;
    cardsZone.innerHTML = ''; 
    
    // 1. Сервер/алгоритм определяет ДРОП заранее на основе лояльности игрока
    const targetRarity = getWeightedRarity(playerAffinity);
    const poolOfTargetRarity = ALL_GAME_CARDS.filter(c => c.rarity === targetRarity);
    const finalWinningCard = poolOfTargetRarity.length > 0 
        ? poolOfTargetRarity[Math.floor(Math.random() * poolOfTargetRarity.length)]
        : ALL_GAME_CARDS[Math.floor(Math.random() * ALL_GAME_CARDS.length)];

    // 2. Генерируем 3 карты, но "победа" привяжется к той, на которую нажмут
    for (let i = 0; i < 3; i++) {
        const cardContainer = document.createElement('div');
        cardContainer.className = 'card-container';
        cardContainer.style.animationDelay = `${i * 0.15}s`;
        cardContainer.dataset.index = i;
        
        // Рубашка
        cardContainer.innerHTML = `
            <div class="card-inner">
                <div class="card-front"></div>
                <div class="card-back">
                    <img src="" class="card-image-bg">
                    <div class="card-content">
                        <div class="card-title"></div>
                        <div class="card-rarity"></div>
                    </div>
                </div>
            </div>
        `;
        
        cardContainer.addEventListener('click', () => {
            // В момент клика присваиваем нажатой карте наш выигрыш, а остальным — пустышки
            lastAwardedCard = finalWinningCard;
            revealAllCardsWithIllusion(cardContainer, finalWinningCard);
        });
        cardsZone.appendChild(cardContainer);
    }
}

function revealAllCardsWithIllusion(selectedCard, winningCard) {
    const allCards = document.querySelectorAll('.game-field .card-container');
    
    allCards.forEach(card => {
        card.style.pointerEvents = 'none';
        const cardBack = card.querySelector('.card-back');
        const img = card.querySelector('.card-image-bg');
        const title = card.querySelector('.card-title');
        const rarityDiv = card.querySelector('.card-rarity');
        
        let currentCardData;
        if (card === selectedCard) {
            currentCardData = winningCard; // Выбранная всегда выигрывает!
            card.classList.add('flipped');
        } else {
            // Другие карты показывают просто случайный хлам из базы для иллюзии
            currentCardData = ALL_GAME_CARDS[Math.floor(Math.random() * ALL_GAME_CARDS.length)];
            setTimeout(() => { card.classList.add('flipped', 'card-leave-right'); }, 200);
        }
        
        const cardColor = RARITY_COLORS[currentCardData.rarity] || "#888";
        cardBack.style.borderColor = cardColor;
        img.src = currentCardData.image_url;
        img.alt = currentCardData.title;
        title.innerText = currentCardData.title;
        rarityDiv.innerText = currentCardData.rarity.toUpperCase();
        rarityDiv.style.color = cardColor;
    });

    // Реплика бота
    const isDuplicate = userInventory[winningCard.id] > 0;
    if (isDuplicate) changeBotSpeech(BOT_PHRASES.drop_duplicate);
    else {
        if (winningCard.rarity === "лега") changeBotSpeech(BOT_PHRASES.drop_legendary);
        else if (winningCard.rarity === "редкая") changeBotSpeech(BOT_PHRASES.drop_rare);
        else changeBotSpeech(BOT_PHRASES.drop_normal);
    }

    // Открытие модального окна сохранения
    setTimeout(() => {
        const clonedCard = selectedCard.cloneNode(true);
        clonedCard.classList.remove('flipped');
        clonedCard.classList.add('modal-view');
        modalInside.innerHTML = '';
        modalInside.appendChild(clonedCard);
        cardModal.style.display = 'flex';
        setTimeout(() => { cardModal.style.opacity = '1'; }, 10);
    }, 900);
}

// ЕДИНАЯ ОЧИЩЕННАЯ ФУНКЦИЯ ЗАКРЫТИЯ МОДАЛКИ С СОХРАНЕНИЕМ
function closeModal() {
    if (lastAwardedCard) {
        const id = lastAwardedCard.id;
        userInventory[id] = (userInventory[id] || 0) + 1;
        
        // В мини-приложении за отправку карт лояльность НЕ начисляется и НЕ отнимается (как в боте)
        if (typeof sendNewCardToServer === 'function') {
            sendNewCardToServer(id, lastAwardedCard.title, lastAwardedCard.rarity);
        }
        if (typeof saveResourcesToServer === 'function') saveResourcesToServer();
    }
    cardModal.style.opacity = '0';
    setTimeout(() => {
        cardModal.style.display = 'none';
        cooldownSeconds = 4 * 3600; // Сброс КД на 4 часа после успешного забора карты
        
        // Перезапускаем кулдаун на сервере через синхронизацию ресурсов
        if (typeof saveResourcesToServer === 'function') saveResourcesToServer();
        if (typeof startTimer === 'function') startTimer();
    }, 400);
}

// СЖИГАНИЕ КАРТЫ (Лояльность больше не уменьшается, синхронизировано с ботом)
function burnAwardedCard() {
    const cardToBurn = modalInside.querySelector('.card-container');
    if (cardToBurn) cardToBurn.classList.add('card-burn-animation');
    changeBotSpeech(BOT_PHRASES.burn_card);

    setTimeout(() => {
        const scrapValue = lastAwardedCard ? (lastAwardedCard.point_value || 10) : 10;
        playerCoins += scrapValue;
        if (coinCountElement) coinCountElement.innerText = playerCoins;
        lastAwardedCard = null; 
        
        cardModal.style.opacity = '0';
        setTimeout(() => {
            cardModal.style.display = 'none';
            cooldownSeconds = 4 * 3600; 
            if (typeof saveResourcesToServer === 'function') saveResourcesToServer();
            if (typeof startTimer === 'function') startTimer();
        }, 400);
    }, 750);
}

function openDeck() {
    if (!deckGrid) return;
    deckGrid.innerHTML = ''; 
    let uniqueOwnedCount = 0;

    ALL_GAME_CARDS.forEach(card => {
        const count = userInventory[card.id] || 0;
        const cardWrapper = document.createElement('div');
        cardWrapper.className = `card-container ${count === 0 ? 'card-locked' : ''}`;
        const cardColor = RARITY_COLORS[card.rarity] || "#888";
        
        if (count > 0) uniqueOwnedCount++;

        cardWrapper.innerHTML = `
            <div class="card-inner">
                <div class="card-front"></div>
                <div class="card-back" style="border-color: ${cardColor}">
                    <img src="${card.image_url}" class="card-image-bg" alt="${card.title}">
                    <div class="card-content">
                        <div class="card-title">${card.title}</div>
                        <div class="card-rarity" style="color: ${cardColor}">${card.rarity.toUpperCase()}</div>
                    </div>
                </div>
            </div>
            ${count > 1 ? `<div class="card-badge">x${count}</div>` : ''}
        `;
        
                if (count > 0) {
            cardWrapper.addEventListener('click', () => { previewCardFromDeck(card); });
        }
        deckGrid.appendChild(cardWrapper);
    });

    if (deckCountElement) deckCountElement.innerText = `${uniqueOwnedCount}/${ALL_GAME_CARDS.length}`;
    deckScreen.style.display = 'flex';
    setTimeout(() => { deckScreen.style.opacity = '1'; }, 10);
}

function previewCardFromDeck(card) {
    lastAwardedCard = card; 
    const cardColor = RARITY_COLORS[card.rarity] || "#888";
    
    modalInside.innerHTML = `
        <div class="card-container modal-view">
            <div class="card-inner">
                <div class="card-front"></div>
                <div class="card-back" style="border-color: ${cardColor}">
                    <img src="${card.image_url}" class="card-image-bg" alt="${card.title}">
                    <div class="card-content">
                        <div class="card-title">${card.title}</div>
                        <div class="card-rarity" style="color: ${cardColor}">${card.rarity.toUpperCase()}</div>
                    </div>
                </div>
            </div>
        </div>
    `;

    const modalActions = document.querySelector('.modal-actions');
    const scrapValue = card.point_value || 10;

    modalActions.innerHTML = `
        <button class="btn-modal btn-keep" onclick="closeModalAfterPreview()">Назад</button>
        <button class="btn-modal btn-burn" id="deck-burn-btn">Сжечь (+${scrapValue} 🪙)</button>
    `;

    document.getElementById('deck-burn-btn').onclick = function() {
        if (!userInventory[card.id]) return;

        const cardToBurn = modalInside.querySelector('.card-container');
        if (cardToBurn) cardToBurn.classList.add('card-burn-animation');
        changeBotSpeech(BOT_PHRASES.burn_card);

        // Лояльность при сжигании в деке больше не падает! (Синхронизировано с ботом)
        setTimeout(() => {
            userInventory[card.id]--;
            if (userInventory[card.id] === 0) delete userInventory[card.id];
            playerCoins += scrapValue;
            if (coinCountElement) coinCountElement.innerText = playerCoins;
            if (typeof saveResourcesToServer === 'function') saveResourcesToServer();
            closeModalAfterPreview();
        }, 750);
    };

    cardModal.style.display = 'flex';
    setTimeout(() => { cardModal.style.opacity = '1'; }, 10);
}

function closeModalAfterPreview() {
    cardModal.style.opacity = '0';
    setTimeout(() => {
        cardModal.style.display = 'none';
        const modalActions = document.querySelector('.modal-actions');
        if (modalActions) {
            modalActions.innerHTML = `
                <button class="btn-modal btn-keep" onclick="closeModal()">В колоду</button>
                <button class="btn-modal btn-burn" onclick="burnAwardedCard()">Сжечь</button>
            `;
        }
        openDeck(); 
    }, 400);
}

function closeDeck() {
    if (!deckScreen) return;
    deckScreen.style.opacity = '0';
    setTimeout(() => { deckScreen.style.display = 'none'; }, 300);
}

