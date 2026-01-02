document.addEventListener("DOMContentLoaded", () => {
    const form = document.querySelector("#add-account form");
    const codesContainer = document.getElementById("codes-container");
    let accounts = JSON.parse(localStorage.getItem("accounts")) || [];

    // Base32 decode function
    function base32Decode(str) {
        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        let bits = 0;
        let value = 0;
        const output = [];
        
        for (let i = 0; i < str.length; i++) {
            const idx = alphabet.indexOf(str[i].toUpperCase());
            if (idx === -1) throw new Error("Invalid base32 character");
            value = (value << 5) | idx;
            bits += 5;
            if (bits >= 8) {
                bits -= 8;
                output.push((value >> bits) & 0xff);
            }
        }
        
        return new Uint8Array(output);
    }

    // TOTP generator using Web Crypto API
    async function generateTotp(secret) {
        try {
            const secretBytes = base32Decode(secret);
            const epoch = Math.floor(Date.now() / 1000);
            const timeCounter = Math.floor(epoch / 30);
            
            // Create counter buffer (big-endian)
            const buffer = new ArrayBuffer(8);
            const view = new DataView(buffer);
            view.setUint32(0, 0, false);
            view.setUint32(4, timeCounter, false);
            
            // Import key
            const key = await crypto.subtle.importKey(
                "raw",
                secretBytes,
                { name: "HMAC", hash: "SHA-1" },
                false,
                ["sign"]
            );
            
            // Generate HMAC
            const signature = await crypto.subtle.sign("HMAC", key, buffer);
            const hash = new Uint8Array(signature);
            
            // Dynamic binary code
            const offset = hash[hash.length - 1] & 0x0f;
            const code = (
                ((hash[offset] & 0x7f) << 24) |
                ((hash[offset + 1] & 0xff) << 16) |
                ((hash[offset + 2] & 0xff) << 8) |
                (hash[offset + 3] & 0xff)
            ) % 1000000;
            
            return String(code).padStart(6, '0');
        } catch (error) {
            console.error("Error generating TOTP:", error);
            return "ERROR";
        }
    }

    const colorMap = {
        purple: "#a855f7",
        pink: "#ec4899",
        red: "#ef4444",
        orange: "#f97316",
        yellow: "#eab308",
        green: "#22c55e",
        blue: "#3b82f6",
        indigo: "#6366f1"
    };

    async function displayCodes() {
        codesContainer.innerHTML = "";
        if (accounts.length === 0) {
            codesContainer.innerHTML = "<p>No accounts added yet.</p>";
            return;
        }
        
        for (let i = 0; i < accounts.length; i++) {
            const account = accounts[i];
            const code = await generateTotp(account.secret);
            const color = colorMap[account.color] || colorMap.purple;
            const codeItem = document.createElement("div");
            codeItem.classList.add("code-item");
            codeItem.style.borderLeftColor = color;
            codeItem.innerHTML = `
                <h3>${account.name}</h3>
                <div class="code">${code}</div>
                <button class="delete-btn" data-index="${i}">Delete</button>
            `;
            codesContainer.appendChild(codeItem);
        }
        
        // Add delete event listeners
        document.querySelectorAll(".delete-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const index = e.target.getAttribute("data-index");
                accounts.splice(index, 1);
                localStorage.setItem("accounts", JSON.stringify(accounts));
                displayCodes();
            });
        });
    }

    if (form) {
        form.addEventListener("submit", (e) => {
            e.preventDefault();
            const accountName = document.getElementById("account-name").value;
            const secretKey = document.getElementById("secret-key").value;
            const accountColor = document.querySelector('input[name="account-color"]:checked').value;
            if (accountName && secretKey) {
                const newAccount = { name: accountName, secret: secretKey, color: accountColor };
                accounts.push(newAccount);
                localStorage.setItem("accounts", JSON.stringify(accounts));
                displayCodes();
                form.reset();
            }
        });
    }

    // Export functionality
    const exportBtn = document.getElementById("export-btn");
    exportBtn.addEventListener("click", () => {
        const dataStr = JSON.stringify(accounts, null, 2);
        const dataBlob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `2factor-backup-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        URL.revokeObjectURL(url);
    });

    // Import functionality
    const importBtn = document.getElementById("import-btn");
    const importFile = document.getElementById("import-file");
    
    importBtn.addEventListener("click", () => {
        importFile.click();
    });

    importFile.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const importedAccounts = JSON.parse(event.target.result);
                    if (Array.isArray(importedAccounts)) {
                        if (confirm(`Import ${importedAccounts.length} accounts? This will replace your current accounts.`)) {
                            accounts = importedAccounts;
                            localStorage.setItem("accounts", JSON.stringify(accounts));
                            displayCodes();
                        }
                    } else {
                        alert("Invalid file format.");
                    }
                } catch (error) {
                    alert("Error reading file: " + error.message);
                }
            };
            reader.readAsText(file);
        }
        importFile.value = "";
    });

    displayCodes();
    // Calculate time until next TOTP refresh (every 30 seconds)
    const timeUntilRefresh = 30000 - (Date.now() % 30000);
    setInterval(displayCodes, 30000, timeUntilRefresh);
});