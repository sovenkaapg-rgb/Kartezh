const cardsZone = document.getElementById('cards-zone');
const cardModal = document.getElementById('card-modal');
const modalInside = document.getElementById('modal-card-inside');
const deckScreen = document.getElementById('deck-screen');
const deckGrid = document.getElementById('deck-grid');
const deckCountElement = document.getElementById('deck-count');
const botSpeech = document.getElementById('bot-speech');

// БАЗА ЖУТКИХ ФРАЗ БОТА
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

// БАЗА КАРТ И ИНВЕНТАРЬ
let ALL_GAME_CARDS = []; 

// Маппинг цветов рамок в зависимости от редкости из вашей базы
const RARITY_COLORS = {
    "обыч": "#888888",
    "редкая": "#3498db",
    "лега": "#e67e22"
};

let userInventory = {}; 
let lastAwardedCard = null; 

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

function initCards() {
    if (!cardsZone || ALL_GAME_CARDS.length === 0) return;
    cardsZone.innerHTML = ''; 
    
    for (let i = 0; i < 3; i++) {
        const cardContainer = document.createElement('div');
        cardContainer.className = 'card-container';
        cardContainer.style.animationDelay = `${i * 0.15}s`;
        
        const randomCard = ALL_GAME_CARDS[Math.floor(Math.random() * ALL_GAME_CARDS.length)];
        const cardColor = RARITY_COLORS[randomCard.rarity] || "#888";
        
        cardContainer.innerHTML = `
            <div class="card-inner">
                <div class="card-front"></div>
                <div class="card-back" style="border-color: ${cardColor}">
                    <img src="${randomCard.image_url}" class="card-image-bg" alt="${randomCard.title}">
                    <div class="card-content">
                        <div class="card-title">${randomCard.title}</div>
                        <div class="card-rarity" style="color: ${cardColor}">${randomCard.rarity.toUpperCase()}</div>
                    </div>
                </div>
            </div>
        `;
        
        cardContainer.addEventListener('click', () => {
            lastAwardedCard = randomCard; 
            revealCard(cardContainer);
        });
        cardsZone.appendChild(cardContainer);
    }
}

function revealCard(selectedCard) {
    selectedCard.classList.add('flipped');
    const allCards = document.querySelectorAll('.game-field .card-container');
    allCards.forEach(card => {
        card.style.pointerEvents = 'none';
        if (card !== selectedCard) card.classList.add('card-leave-right');
    });

    const isDuplicate = userInventory[lastAwardedCard.id] > 0;
    if (isDuplicate) changeBotSpeech(BOT_PHRASES.drop_duplicate);
    else {
        if (lastAwardedCard.rarity === "лега") changeBotSpeech(BOT_PHRASES.drop_legendary);
        else if (lastAwardedCard.rarity === "редкая") changeBotSpeech(BOT_PHRASES.drop_rare);
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
    }, 700);
}

function closeModal() {
    if (lastAwardedCard) {
        const id = lastAwardedCard.id;
        userInventory[id] = (userInventory[id] || 0) + 1;
        playerAffinity = Math.min(100, playerAffinity + 2);
        if (typeof updateAffinityUI === 'function') updateAffinityUI();
        if (typeof saveResourcesToServer === 'function') saveResourcesToServer();
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

    playerAffinity = Math.max(0, playerAffinity - 5);
    if (typeof updateAffinityUI === 'function') updateAffinityUI();

    setTimeout(() => {
        const scrapValue = lastAwardedCard ? (lastAwardedCard.point_value || 10) : 15;
        playerCoins += scrapValue;
        if (coinCountElement) coinCountElement.innerText = playerCoins;
        lastAwardedCard = null; 
        if (typeof saveResourcesToServer === 'function') saveResourcesToServer();
        
        cardModal.style.opacity = '0';
        setTimeout(() => {
            cardModal.style.display = 'none';
            cooldownSeconds = 4 * 3600; 
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

        playerAffinity = Math.max(0, playerAffinity - 4);
        if (typeof updateAffinityUI === 'function') updateAffinityUI();

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

// ОБНОВЛЕННАЯ БАЗА ОПРОСОВ ПОД ФОРМАТ ДА/НЕТ
const SAMPLE_QUIZZES = [
    {
        id: 101,
        question: "🔮 Бот: Слышишь этот шепот во тьме? Ты готов ответить ему взаимностью?",
        options: [
            { text: "Да", affinityChange: 5, reply: "Правильный выбор... Бездна любит взаимность." },
            { text: "Нет", affinityChange: -4, reply: "Твой жалкий свет лишь раздражает меня..." }
        ]
    },
    {
        id: 102,
        question: "🔮 Бот: Как думаешь, магия крови и обмана разума — это истинная сила?",
        options: [
            { text: "Да", affinityChange: 6, reply: "О да... Настоящая сила требует сочной платы." },
            { text: "Нет", affinityChange: -5, reply: "Слабость... Какая глупость верить в мораль смертных." }
        ]
    }
];

function triggerRandomQuiz() {
    const optionsZone = document.getElementById('quiz-options-zone');
    if (!optionsZone) return;

    const randomQuiz = SAMPLE_QUIZZES[Math.floor(Math.random() * SAMPLE_QUIZZES.length)];
    
    changeBotSpeech(randomQuiz.question);
    
    optionsZone.innerHTML = ''; 
    optionsZone.style.display = 'flex'; 

    randomQuiz.options.forEach(option => {
        const btn = document.createElement('button');
        btn.className = 'btn-quiz-inline';
        btn.innerText = option.text;
        
        btn.onclick = function() {
            playerAffinity = Math.max(0, Math.min(100, playerAffinity + option.affinityChange));
            if (typeof updateAffinityUI === 'function') updateAffinityUI();
            
            changeBotSpeech(option.reply);
            optionsZone.style.display = 'none'; 
            if (typeof saveResourcesToServer === 'function') saveResourcesToServer();
        };
        optionsZone.appendChild(btn);
    });

    const skipBtn = document.createElement('button');
    skipBtn.className = 'btn-quiz-inline btn-quiz-skip';
    skipBtn.innerText = "✕";
    skipBtn.onclick = function() {
        changeBotSpeech("Игнорируешь меня? Что ж... как угодно.");
        optionsZone.style.display = 'none'; 
    };
    optionsZone.appendChild(skipBtn);
}
