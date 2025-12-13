# Death Clock

A clock that counts down the seconds you have left to live

## Description

This GNOME Shell extension displays a countdown timer in your panel showing the time remaining until a target date. Perfect for tracking important milestones or deadlines with a memento mori approach.

## Inspiration

This extension is inspired by Vsauce's Death Clock concept:
- **Video**: [How Long Will You Live?](https://www.youtube.com/watch?v=xHd4zsIbXJ0&t=157s)

## Features

- **Countdown Display**: Shows time remaining in your chosen unit
- **Multiple Time Units**: Display countdown in seconds, minutes, hours, days, weeks, months, or years
- **Number Formatting Options**:
  - No commas (raw number)
  - Indian format (1,00,000)
  - International format (1,000,000)
- **Customizable Display**:
  - Toggle unit text visibility
  - Toggle icon (⏱️) visibility
- **Easy Date Setting**: Simple dialog to set your target date
- **Persistent Settings**: Your preferences are automatically saved

## Installation

1. Copy the extension folder to `~/.local/share/gnome-shell/extensions/`
2. Restart GNOME Shell (Alt+F2, type `r`, press Enter)
3. Enable the extension using GNOME Extensions app or:
   ```bash
   gnome-extensions enable deathclock@prabuddh.in
   ```

## Usage

1. Click on the Death Clock indicator in your panel
2. Select "Set Date" to enter your target date (format: YYYY-MM-DD)
3. Choose your preferred display unit (seconds, minutes, hours, etc.)
4. Customize number formatting to your preference
5. Toggle unit text and icon display options

## Requirements

- GNOME Shell 48

## License

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 2 of the License, or (at your option) any later version.

See the extension.js file for the complete license text.

## Contributing

Feel free to report issues or suggest improvements!
