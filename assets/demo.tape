# VHS tape for roast-my-react demo GIF
# Requires the fixture app running on http://localhost:5173
# Run: npm run demo:record  (starts the app + records)

Output assets/demo.gif

Set FontSize 18
Set FontFamily "JetBrains Mono, SF Mono, Menlo, monospace"
Set Width 1200
Set Height 780
Set Padding 24
Set Theme "Catppuccin Mocha"

# Clean, centered terminal look
Set Shell bash
Set TypingSpeed 50ms

Hide
Type "clear"
Enter
Sleep 200ms
Show

# Clean prompt
Type "export PS1='➜ '"
Enter
Sleep 100ms

# Title card
Type "# roast-my-react  —  audit your React app, get roasted, get fixed"
Enter
Sleep 200ms

# Run the CLI against the fixture app
Type "npx roast-my-react --url http://localhost:5173 --severity 3 --fast"
Enter

# Wait for the audit + AI roast to complete (~50s on a fast connection)
Sleep 56s

# Hold the final frame
Sleep 3s
