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
    drop_normal: "Ообычная безделушка... Ей место в грязи.",
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

function initCards() {
    if (!cardsZone || ALL_GAME_CARDS.length === 0) return;
    cardsZone.innerHTML = ''; 
    
    const targetRarity = getWeightedRarity(playerAffinity);
    const poolOfTargetRarity = ALL_GAME_CARDS.filter(c => c.rarity === targetRarity);
    const finalWinningCard = poolOfTargetRarity.length > 0 
        ? poolOfTargetRarity[Math.floor(Math.random() * poolOfTargetRarity.length)]
        : ALL_GAME_CARDS[Math.floor(Math.random() * ALL_GAME_CARDS.length)];

    for (let i = 0; i < 3; i++) {
        const cardContainer = document.createElement('div');
        cardContainer.className = 'card-container';
        cardContainer.style.animationDelay = `${i * 0.15}s`;
        cardContainer.dataset.index = i;
        
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
            currentCardData = winningCard;
            card.classList.add('flipped');
        } else {
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

    const isDuplicate = userInventory[winningCard.id] > 0;
    if (isDuplicate) changeBotSpeech(BOT_PHRASES.drop_duplicate);
    else {
        if (winningCard.rarity === "лега") changeBotSpeech(BOT_PHRASES.drop_legendary);
        else if (winningCard.rarity === "редкая") changeBotSpeech(BOT_PHRASES.drop_rare);
        else changeBotSpeech(BOT_PHRASES.drop_normal);
    }

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

function closeModal() {
    if (lastAwardedCard) {
        const id = lastAwardedCard.id;
        userInventory[id] = (userInventory[id] || 0) + 1;
        
        if (typeof sendNewCardToServer === 'function') {
            sendNewCardToServer(id, lastAwardedCard.title, lastAwardedCard.rarity);
        }
    }
    cardModal.style.opacity = '0';
    setTimeout(() => {
        cardModal.style.display = 'none';
        cooldownSeconds = 4 * 3600; 
        if (typeof startTimer === 'function') startTimer();
    }, 400);
}

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

// Функция плавного закрытия модалки просмотра деки
function closeModalAfterPreview() {
    cardModal.style.opacity = '0';
    setTimeout(() => {
        cardModal.style.display = 'none';
        // Возвращаем стандартные обработчики кнопок обратно
        const modalActions = document.querySelector('.modal-actions');
        if (modalActions) {
            modalActions.innerHTML = `
                <button class="btn-modal btn-keep" onclick="closeModal()">В колоду</button>
                <button class="btn-modal btn-burn" onclick="burnAwardedCard()">Сжечь</button>
            `;
        }
        openDeck(); // Обновляем грид колоды, чтобы убрать сожженную карту
    }, 400);
}

function previewCardFromDeck(card) {
    lastAwardedCard = card; 
    const cardColor = RARITY_COLORS[card.rarity] || "#888";
    
    // ВАЖНО: Вешаем класс 'flipped', чтобы карта сразу стояла лицом к игроку и отображала арт!
    modalInside.innerHTML = `
        <div class="card-container modal-view flipped">
            <div class="card-inner">
                <div class="card-front"></div>
                <div class="card-back" style="border-color: ${cardColor}; background-color: #2c1a30;">
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

        // Находим внутренний контейнер карты для применения анимации сгорания
        const cardToBurn = modalInside.querySelector('.card-container');
        if (cardToBurn) cardToBurn.classList.add('card-burn-animation');
        changeBotSpeech(BOT_PHRASES.burn_card);

        // Ждем ровно 750мс окончания CSS-эффекта пепла
        setTimeout(() => {
            userInventory[card.id]--;
            if (userInventory[card.id] === 0) delete userInventory[card.id];
            
            playerCoins += scrapValue;
            if (coinCountElement) coinCountElement.innerText = playerCoins;
            
            if (typeof saveResourcesToServer === 'function') saveResourcesToServer();
            
            // Теперь функция существует и окно закроется автоматически!
            closeModalAfterPreview();
        }, 750);
    };

    cardModal.style.display = 'flex';
    setTimeout(() => { cardModal.style.opacity = '1'; }, 10);
}

function closeDeck() {
    if (!deckScreen) return;
    deckScreen.style.opacity = '0';
    setTimeout(() => { 
        deckScreen.style.display = 'none'; 
        // При закрытии колоды проверяем таймер, чтобы вернуть карты на поле, если время пришло
        if (typeof updateCardsAvailability === 'function') updateCardsAvailability();
    }, 300);
}

// ПРИНУДИТЕЛЬНО ПРИВЯЗЫВАЕМ КЛИК К КРЕСТИКУ ПОСЛЕ ЗАГРУЗКИ СТРАНИЦЫ
window.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.querySelector('.btn-close-deck');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeDeck);
    }
});

