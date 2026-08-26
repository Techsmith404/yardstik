# 🪄 Kiosk Markdown Magic Words

This document lists all the custom "Magic Words" you can use inside your `html/assets/data/reminders.md` file to completely transform how a slide behaves on the Kiosk.

## 📌 How to Use
Drop these magic words anywhere **below** the `H1` header (`# `) of a slide. You can combine multiple magic words on a single slide! The system will automatically detect them, apply the styling/logic, and then hide the magic word itself from the final display.

---

### 🚨 Alert & Priority Flags
Changes the glowing border effect of the Reminders widget.
* **`!HIGH`** - Applies a pulsing Neon Orange/Amber glow to the widget border. Perfect for warnings.
* **`!CRITICAL`** - Applies an aggressive, rapid-pulsing Red glow. Used for immediate safety halts or severe weather.

### ⏱️ Timing Overrides
Changes how long the slide stays on the screen.
* **`!LONG`** - Pauses the Kiosk view rotation loop and holds this specific slide on the screen for a full **2 minutes** (120 seconds) instead of the standard 40 seconds. Use this for long reads or detailed procedures.
* **`!ONLY`** - Hides all other slides in the file and exclusively loops any slides containing this magic word. Use this to quickly force a high-priority temporary message without deleting your standard slides.

### 📐 Layout & Text Formatting
Changes how the text inside the slide is displayed.
* **`!SPLIT`** - Breaks any bulleted (`*`, `-`) or numbered (`1.`) lists on the slide into perfectly spaced side-by-side columns.
* **`!LARGE`** - Boosts the font size of the entire slide by 50% (to 1.5rem). Great for punchy, one-line announcements.
* **`!CENTER`** - Centers the text perfectly in the middle of the widget, both vertically and horizontally. 

### ⚙️ Interactive Generators
Injects live, dynamic elements directly into the slide.
* **`!COUNTDOWN MM-DD-HH-mm`** 
  * *Example:* `!COUNTDOWN 12-25-14-30`
  * *Action:* Injects a live, ticking, neon-cyan countdown timer at the bottom of the slide counting down the days, hours, minutes, and seconds until the target date.
* **`!QR https://your-link.com`**
  * *Example:* `!QR https://hr-portal.company.com/overtime`
  * *Action:* Automatically generates a large, scannable QR Code wrapped in a nice white border so employees can instantly scan the link with their phones.

---

### 📝 Example Slide

```markdown
# ⚠️ Heavy Lift in Bay 4
!CRITICAL
!LARGE
!CENTER

Overhead Cranes 3 and 4 are moving heavy payloads today. Keep the floor clear!
```
*(This slide will glow red, have large centered text, and normal 40s duration)*

```markdown
# 🎄 Company Christmas Party
!SPLIT
!COUNTDOWN 12-20-14-30

Please bring the following items to the potluck:
* Plates
* Napkins
* Drinks
* Desserts
```
*(This slide will have a glowing countdown timer, and the list of items will be split into two columns)*
