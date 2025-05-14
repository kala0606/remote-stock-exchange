let prices = {};
const BAR_WIDTH = 60;
const BAR_SPACING = 60;
const MAX_HEIGHT = 300;
const PRICE_SCALE = 2;
const MARKET_Y_OFFSET = 230;
const MARKET_TEXT_BOX_HEIGHT = 35;

// Card constants
const CARD_WIDTH = 80;
const CARD_HEIGHT = 120;
const CARD_SPACING = 10;
const CARDS_Y = 420;

// Define company colors (can be expanded or customized)
// Ensure this matches the order in server.js or use a mapping
const COMPANIES_FOR_SKETCH = [
    { id:'WCK', name: 'Wockhardt Pharma', color: '#FF6347' }, // Tomato
    { id:'HDF', name: 'HDFC Bank', color: '#4682B4' },         // SteelBlue
    { id:'TIS', name: 'Tata Steel', color: '#32CD32' },        // LimeGreen
    { id:'ONG', name: 'ONGC Ltd', color: '#FFD700' },          // Gold
    { id:'REL', name: 'Reliance Industries', color: '#6A5ACD' },// SlateBlue
    { id:'INF', name: 'Infosys Ltd', color: '#40E0D0' }         // Turquoise
];

function getCompanyNameForSketch(id) {
    const company = COMPANIES_FOR_SKETCH.find(c => c.id === id);
    return company ? company.name : (window.companyNames ? window.companyNames[id] : id);
}

// Helper function to get company color by ID
function getCompanyColorForSketch(id) {
    const company = COMPANIES_FOR_SKETCH.find(c => c.id === id);
    return company ? company.color : '#cccccc'; // Default to grey if not found
}

// Helper function to calculate luminance and determine text color
function getTextColorForBackground(hexColor) {
    const rgb = parseInt(hexColor.slice(1), 16);   // convert rrggbb to decimal
    const r = (rgb >> 16) & 0xff;  // extract red
    const g = (rgb >>  8) & 0xff;  // extract green
    const b = (rgb >>  0) & 0xff;  // extract blue

    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b; // per ITU-R BT.709

    return luma < 128 ? '#FFFFFF' : '#000000'; // White text for dark, Black for light
}

function setup() {
    const canvas = createCanvas(900, 600);
    canvas.parent('canvas-container');
}

function draw() {
    background(255); // Light grey background, similar to Bootstrap's .bg-light
    drawMarketBoard(prices);
    drawPlayerHand();
}

function drawMarketBoard(currentPrices) {
    if (!currentPrices || Object.keys(currentPrices).length === 0) {
        fill(150);
        textAlign(CENTER,CENTER);
        textSize(16);
        text("Market data not available yet.", width/2, MARKET_Y_OFFSET + (height - MARKET_Y_OFFSET - CARDS_Y - 20)/2);
        return;
    }

    textAlign(CENTER, CENTER);
    const barWidth = 120;
    const spacing = 15;
    const chartAreaTopPadding = 20;
    const chartBottomY = height - CARD_HEIGHT - MARKET_Y_OFFSET + 50;
    const chartAvailableHeight = 150;

    let maxCurrentPrice = 0;
    for (const company of COMPANIES_FOR_SKETCH) {
        const price = currentPrices[company.id] || 0;
        if (price > maxCurrentPrice) {
            maxCurrentPrice = price;
        }
    }
    if (maxCurrentPrice === 0) {
        maxCurrentPrice = 50;
    }

    const startX = (width - (COMPANIES_FOR_SKETCH.length * (barWidth + spacing) - spacing)) / 2;

    COMPANIES_FOR_SKETCH.forEach((company, index) => {
        const x = startX + index * (barWidth + spacing);
        const price = currentPrices[company.id] || 0;
        
        const barHeight = price > 0 ? Math.max(1, map(price, 0, maxCurrentPrice, 0, chartAvailableHeight)) : 0;
        
        fill(color(company.color || '#cccccc'));

        const actualBarY = chartBottomY - barHeight;
        rect(x, actualBarY, barWidth, barHeight, 5, 5, 0, 0);

        fill(0);
        textSize(12);
        textAlign(CENTER, BOTTOM);
        text(`₹${price}`, x + barWidth / 2, Math.max(chartBottomY - chartAvailableHeight - chartAreaTopPadding + 15, actualBarY - 5));

        const textBoxY = chartBottomY + 5;
        fill(255, 255, 255, 200);
        stroke(200);
        strokeWeight(0.5);
        rect(x, textBoxY, barWidth, MARKET_TEXT_BOX_HEIGHT, 3);

        fill(0);
        noStroke();
        textSize(10);
        textAlign(CENTER, CENTER);
        let companyDisplayName = getCompanyNameForSketch(company.id);
        let nameParts = splitLongName(companyDisplayName, 10);
        
        if (nameParts.length > 1) {
            text(nameParts[0], x + barWidth / 2, textBoxY + (MARKET_TEXT_BOX_HEIGHT / 2) - 6);
            text(nameParts[1], x + barWidth / 2, textBoxY + (MARKET_TEXT_BOX_HEIGHT / 2) + 6);
        } else {
            text(nameParts[0], x + barWidth / 2, textBoxY + MARKET_TEXT_BOX_HEIGHT / 2);
        }
    });
}

function drawPlayerHand() {
    const handToDraw = window.playerHand || [];
    if (handToDraw.length === 0) return;

    const totalWidth = handToDraw.length * (CARD_WIDTH + CARD_SPACING) - CARD_SPACING;
    let x = (width - totalWidth) / 2;

    handToDraw.forEach(card => {
        if (typeof card !== 'object' || card === null) {
            console.warn('Skipping drawing of invalid card:', card);
            x += CARD_WIDTH + CARD_SPACING;
            return;
        }
        drawCardVisual(x, CARDS_Y, card);
        x += CARD_WIDTH + CARD_SPACING;
    });
}

function drawCardVisual(x, y, card) {
    push();
    translate(x, y);

    let cardBgColor = color(255); // Default white for windfall or unknown
    let mainTextColor;

    if (card.type === 'price') {
        const companyColorHex = getCompanyColorForSketch(card.company);
        cardBgColor = color(companyColorHex);
        mainTextColor = color(getTextColorForBackground(companyColorHex));
    } else { // Windfall or other types
        cardBgColor = color(240, 240, 240); // Light grey for windfall
        mainTextColor = color(0); // Black text for windfall
    }

    if (card.played) {
        // Dim the original color slightly then overlay with semi-transparent grey
        let playedBg = lerpColor(cardBgColor, color(120), 0.5); // Blend with grey
        fill(red(playedBg), green(playedBg), blue(playedBg), 200); // Apply with alpha
        stroke(150);
        mainTextColor = color(100); // Darker grey text for played cards
    } else {
        fill(cardBgColor);
        stroke(100);
    }
    strokeWeight(1);
    rect(0, 0, CARD_WIDTH, CARD_HEIGHT, 8);

    // Draw positive/negative band for price cards (if not played)
    if (card.type === 'price' && !card.played) {
        const bandWidth = 8;
        const bandHeight = CARD_HEIGHT;
        const bandX = 0; // Draw on the left edge
        // const bandX = CARD_WIDTH - bandWidth; // Draw on the right edge
        
        if (card.change > 0) {
            fill(34, 139, 34, 230); // Dark Green, slightly transparent
        } else if (card.change < 0) {
            fill(220, 20, 60, 230);  // Crimson Red, slightly transparent
        } else {
            noFill(); // Or a neutral color if change is 0
        }
        noStroke();
        // rect(bandX, 0, bandWidth, bandHeight, 8,0,0,8); // Rounded on one side if bandX is 0
        rect(bandX, 0, bandWidth, bandHeight, (bandX === 0 ? 8 : 0), (bandX > 0 ? 8 : 0), (bandX > 0 ? 8 : 0), (bandX === 0 ? 8 : 0));


    }


    textAlign(CENTER, CENTER);
    textSize(11);
    noStroke(); // Ensure text isn't stroked by default after band
    
    // Set text color based on calculations above (or specific for played)
    fill(mainTextColor);


    let line1 = '';
    let line2 = '';
    let line3 = '';

    if (card.type === 'price') {
        let companyDisplayName = getCompanyNameForSketch(card.company);
        let nameParts = splitLongName(companyDisplayName, 12);
        line1 = nameParts[0] || '';
        line2 = nameParts[1] || '';
        
        let changeText = `${card.change > 0 ? '+' : ''}${card.change}`;
        if (nameParts.length <= 1) {
            line2 = `Price: ${changeText}`;
        } else {
            line3 = `Price: ${changeText}`;
        }
        
        // Text color is already set by mainTextColor, price change color is handled by the band now
        // push();
        // if (card.change > 0) fill(34, 139, 34);
        // else if (card.change < 0) fill(220, 20, 60);
        // else fill(card.played ? 120 : 0);

        if (line3) {
            text(line1, CARD_WIDTH / 2, CARD_HEIGHT / 2 - 18);
            text(line2, CARD_WIDTH / 2, CARD_HEIGHT / 2);
            text(line3, CARD_WIDTH / 2, CARD_HEIGHT / 2 + 18);
        } else {
            text(line1, CARD_WIDTH / 2, CARD_HEIGHT / 2 - 10);
            text(line2, CARD_WIDTH / 2, CARD_HEIGHT / 2 + 10);
        }
        // pop();

    } else if (card.type === 'windfall') {
        line1 = 'Windfall';
        line2 = card.sub;
        text(line1, CARD_WIDTH / 2, CARD_HEIGHT / 2 - 10);
        text(line2, CARD_WIDTH / 2, CARD_HEIGHT / 2 + 10);
    } else {
        line1 = 'Unknown';
        line2 = 'Card';
        text(line1, CARD_WIDTH / 2, CARD_HEIGHT / 2 - 10);
        text(line2, CARD_WIDTH / 2, CARD_HEIGHT / 2 + 10);
    }
    pop();
}

function splitLongName(name, maxLengthPerLine) {
    if (typeof name !== 'string') return [''];
    let parts = [];
    let currentLine = '';
    let words = name.split(' ');

    for (let word of words) {
        if (currentLine.length + word.length + (currentLine.length > 0 ? 1 : 0) <= maxLengthPerLine) {
            currentLine += (currentLine.length > 0 ? ' ' : '') + word;
        } else {
            if (currentLine.length > 0) parts.push(currentLine);
            currentLine = word;
            if (word.length > maxLengthPerLine && parts.length === 0) {
                 parts.push(word.substring(0, maxLengthPerLine-1) + '-');
                 currentLine = word.substring(maxLengthPerLine-1);
            }
        }
    }
    if (currentLine.length > 0) parts.push(currentLine);
    return parts.slice(0, 2);
}

function updateMarketBoard(newPrices) {
    prices = newPrices;
}

// window.playerHand is updated directly by client.js
// So, no specific updatePlayerHand function needed here unless for extra logic.

// mousePressed is handled by client.js for card clicks
// function mousePressed() { ... }