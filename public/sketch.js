let prices = {};
const BAR_WIDTH = 60;
const BAR_SPACING = 60;
const MAX_HEIGHT = 300;
const PRICE_SCALE = 2;
const MARKET_Y_OFFSET = 130;
const MARKET_TEXT_BOX_HEIGHT = 35;

// Card constants
const CARD_WIDTH = 80;
const CARD_HEIGHT = 120;
const CARD_SPACING = 10;
const CARDS_Y = 420;

function setup() {
    const canvas = createCanvas(900, 600);
    canvas.parent('canvas-container');
    textAlign(CENTER, CENTER);
    textSize(14);
    strokeWeight(1);
}

function draw() {
    background(255);
    drawMarketBoard();
    drawPlayerHand();
}

function drawMarketBoard() {
    // Draw price bars
    const companies = Object.entries(prices);
    if (companies.length === 0) return;
    const totalWidth = companies.length * (BAR_WIDTH + BAR_SPACING) - BAR_SPACING;
    let x = (width - totalWidth) / 2;

    // Get active suspensions (assuming client.js makes this available, e.g., window.activeSuspensions)
    const activeSuspensions = window.activeSuspensions || {}; // { companyName: true }
    const companyNames = window.companyNames || {}; // Get name mapping

    companies.forEach(([companyId, price]) => {
        const companyName = companyNames[companyId] || companyId; // Use full name
        const isSuspended = activeSuspensions[companyId];
        
        // Bar position and height
        const barHeight = max(1, price / PRICE_SCALE);
        const barY = height - CARD_HEIGHT - MARKET_Y_OFFSET - barHeight;
        const barX = x;

        // Draw bar
        if (isSuspended) {
            fill(255, 100, 100); // Light red for suspended
            stroke(200, 0, 0); // Darker red border
        } else {
            fill(200, 200, 200);
            stroke(100);
        }
        strokeWeight(1);
        rect(barX, barY, BAR_WIDTH, barHeight);

        // Draw background box for company name
        const textBoxY = height - CARD_HEIGHT - MARKET_Y_OFFSET + 5; // Position below bar baseline
        fill(250, 250, 250, 200); // Semi-transparent light background
        noStroke();
        rect(barX, textBoxY, BAR_WIDTH, MARKET_TEXT_BOX_HEIGHT, 3); // Rounded corners

        // Draw company name inside the box - attempt split into two lines
        fill(0);
        textAlign(CENTER, CENTER);
        textSize(10); // Smaller text for two lines

        let line1 = companyName;
        let line2 = null;
        const maxCharsPerLine = 12; // Approx chars that fit well

        if (companyName.length > maxCharsPerLine && companyName.includes(' ')) {
            let splitIndex = -1;
            // Try splitting at the last space before the middle
            let middle = Math.floor(companyName.length / 2);
            for (let i = middle; i > 0; i--) {
                if (companyName[i] === ' ') {
                    splitIndex = i;
                    break;
                }
            }
            // If no space before middle, try first space after middle
            if (splitIndex === -1) {
                 for (let i = middle + 1; i < companyName.length; i++) {
                    if (companyName[i] === ' ') {
                        splitIndex = i;
                        break;
                    }
                }
            }

            if (splitIndex !== -1) {
                line1 = companyName.substring(0, splitIndex).trim();
                line2 = companyName.substring(splitIndex + 1).trim();
            }
        }
        
        if (line2) {
             // Draw two lines
            text(line1, barX + BAR_WIDTH/2, textBoxY + MARKET_TEXT_BOX_HEIGHT/2 - 6); // Line 1 slightly up
            text(line2, barX + BAR_WIDTH/2, textBoxY + MARKET_TEXT_BOX_HEIGHT/2 + 6); // Line 2 slightly down
        } else {
            // Draw single line if short or no good split point
            text(line1, barX + BAR_WIDTH/2, textBoxY + MARKET_TEXT_BOX_HEIGHT/2); 
        }
        
        // Draw price above the bar
        noStroke();
        fill(isSuspended ? '#dc3545' : 0); // Red price if suspended
        textAlign(CENTER, BOTTOM);
        textSize(12);
        text(`₹${price}`, barX + BAR_WIDTH/2, barY - 5);

        x += BAR_WIDTH + BAR_SPACING;
    });
}

function drawPlayerHand() {
    if (!window.playerHand || window.playerHand.length === 0) return;

    const totalWidth = window.playerHand.length * (CARD_WIDTH + CARD_SPACING) - CARD_SPACING;
    let x = (width - totalWidth) / 2;

    window.playerHand.forEach(card => {
        drawCard(x, CARDS_Y, card);
        x += CARD_WIDTH + CARD_SPACING;
    });
}

function drawCard(x, y, card) {
    push();
    translate(x, y);
    const companyNames = window.companyNames || {}; // Get name mapping

    // Card background and border
    stroke(150);
    fill(245);
    rect(0, 0, CARD_WIDTH, CARD_HEIGHT, 5);

    // Card content
    noStroke();
    textAlign(CENTER, CENTER);
    fill(0);

    if (card.type === 'price') {
        // Price change at top right
        textSize(11);
        textAlign(RIGHT, TOP);
        const change = card.change;
        const changeText = (change >= 0 ? '+' : '') + '₹' + change;
        fill(change >= 0 ? '#28a745' : '#dc3545');
        text(changeText, CARD_WIDTH - 6, 6);

        // Company name in center, potentially split
        textSize(10); // Use smaller text for potential two lines
        textAlign(CENTER, CENTER);
        fill(0);
        const companyName = companyNames[card.company] || card.company;
        
        let line1 = companyName;
        let line2 = null;
        const maxCharsPerLineCard = 10; // Max chars for cards (adjust as needed)

        if (companyName.length > maxCharsPerLineCard && companyName.includes(' ')) {
            let splitIndex = -1;
            let middle = Math.floor(companyName.length / 2);
            // Find last space before middle
            for (let i = middle; i > 0; i--) {
                if (companyName[i] === ' ') {
                    splitIndex = i;
                    break;
                }
            }
            // Or first space after middle
            if (splitIndex === -1) {
                 for (let i = middle + 1; i < companyName.length; i++) {
                    if (companyName[i] === ' ') {
                        splitIndex = i;
                        break;
                    }
                }
            }

            if (splitIndex !== -1) {
                line1 = companyName.substring(0, splitIndex).trim();
                line2 = companyName.substring(splitIndex + 1).trim();
            }
        }

        if (line2) {
            // Draw two lines
            text(line1, CARD_WIDTH/2, CARD_HEIGHT/2); // Line 1 centered
            text(line2, CARD_WIDTH/2, CARD_HEIGHT/2 + 12); // Line 2 below
        } else {
            // Draw single line
            text(line1, CARD_WIDTH/2, CARD_HEIGHT/2 + 5); // Centered vertically
        }

    } else if (card.type === 'windfall') {
        if (card.played) {
            fill(180, 180, 220); // Dimmed purple for played windfall
        } else {
            fill('#6f42c1'); // Original purple
        }
        // Windfall title
        textSize(15);
        textAlign(CENTER, CENTER);
        text(card.sub, CARD_WIDTH/2, CARD_HEIGHT/2);
        
        textSize(10);
        if (card.played) {
            fill(150);
        } else {
            fill(100);
        }
        textAlign(CENTER, BOTTOM);
        // text('Windfall', CARD_WIDTH/2, CARD_HEIGHT - 8);

    } else if (card.type === 'suspend') {
        if (card.played) {
            fill(220, 220, 180, 200); // Dimmed yellow for played suspend, slight alpha
            stroke(180, 180, 140);
        } else {
            fill(255, 215, 0); // Gold color for suspend card
            stroke(180, 150, 0);
        }
        strokeWeight(1);
        rect(0, 0, CARD_WIDTH, CARD_HEIGHT, 5); // Redraw rect for played state border

        // Text color based on played state
        fill(card.played ? 150 : 0); 
        noStroke(); 

        textSize(14);
        textAlign(CENTER, CENTER);
        text("SUSPEND", CARD_WIDTH / 2, CARD_HEIGHT / 2 - 10);
        textSize(10);
        textAlign(CENTER, BOTTOM);
        text("Price Freeze", CARD_WIDTH/2, CARD_HEIGHT - 8);

    } else {
        // Fallback for unknown card type (now only price/windfall expected)
        fill(255, 0, 0); // Red
        text('???', CARD_WIDTH/2, CARD_HEIGHT/2);
        console.error('Unknown or malformed card type in drawCard:', JSON.parse(JSON.stringify(card)));
    }
    pop();
}

function updateMarketBoard(newPrices) {
    prices = newPrices;
}

function updatePlayerHand(newHand) {
    window.playerHand = newHand;
}