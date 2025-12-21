/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const TIME_UNITS = {
    SECONDS: 'seconds',
    MINUTES: 'minutes',
    HOURS: 'hours',
    DAYS: 'days',
    WEEKS: 'weeks',
    MONTHS: 'months',
    YEARS: 'years'
};

const NUMBER_FORMATS = {
    NONE: 'none',
    INDIAN: 'indian',
    INTERNATIONAL: 'international'
};

const DeathClockIndicator = GObject.registerClass(
class DeathClockIndicator extends PanelMenu.Button {
    _init(extensionPath) {
        super._init(0.5, _('Death Clock'));
        
        this._extensionPath = extensionPath;
        this._settingsFile = GLib.build_filenamev([extensionPath, 'settings.json']);
        this._targetDate = null;
        this._currentUnit = TIME_UNITS.DAYS;
        this._showUnitText = true;
        this._showIcon = true;
        this._numberFormat = NUMBER_FORMATS.INTERNATIONAL;
        this._timeout = null;
        this._saveTimeout = null;
        
        // Load settings
        this._loadSettings();
        
        // Create label for countdown display
        this._label = new St.Label({
            text: this._getCountdownText(),
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'death-clock-label'
        });
        this.add_child(this._label);
        
        // Build menu
        this._buildMenu();
        
        // Start update timer
        this._startTimer();
    }
    
    _loadSettings() {
        let file = Gio.File.new_for_path(this._settingsFile);

        // Asynchronously load settings to avoid blocking the GNOME Shell main loop
        file.load_contents_async(null, (source, res) => {
            try {
                let [success, contents] = source.load_contents_finish(res);
                if (success && contents) {
                    let settings = JSON.parse(new TextDecoder().decode(contents));
                    if (settings.targetDate) {
                        this._targetDate = new Date(settings.targetDate);
                    }
                    if (settings.unit) {
                        this._currentUnit = settings.unit;
                    }
                    if (settings.showUnitText !== undefined) {
                        this._showUnitText = settings.showUnitText;
                    }
                    if (settings.showIcon !== undefined) {
                        this._showIcon = settings.showIcon;
                    }
                    if (settings.numberFormat) {
                        this._numberFormat = settings.numberFormat;
                    }
                }
            } catch (e) {
                console.error(`Death Clock: Error loading settings: ${e}`);
            } finally {
                // Ensure we have a sensible default target date
                if (!this._targetDate) {
                    this._targetDate = new Date();
                    this._targetDate.setFullYear(this._targetDate.getFullYear() + 80);
                }

                // Update UI/menu to reflect loaded settings
                this._updateDateDisplay();
                if (this._unitMenuItems) this._updateUnitMenuItems();
                if (this._formatMenuItems) this._updateFormatMenuItems();
                this._updateDisplay();
            }
        });
    }
    
    _saveSettings() {
        let settings = {
            targetDate: this._targetDate.toISOString(),
            unit: this._currentUnit,
            showUnitText: this._showUnitText,
            showIcon: this._showIcon,
            numberFormat: this._numberFormat
        };
        let file = Gio.File.new_for_path(this._settingsFile);
        // Use async replace to avoid blocking GNOME Shell
        let contents = JSON.stringify(settings);
        file.replace_contents_async(contents, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null,
            (source, res) => {
                try {
                    source.replace_contents_finish(res);
                } catch (e) {
                    console.error(`Death Clock: Error saving settings: ${e}`);
                }
            }
        );
    }

    _scheduleSave(delayMs = 1000) {
        // Debounce multiple rapid setting changes to avoid excessive disk writes
        if (this._saveTimeout) {
            GLib.source_remove(this._saveTimeout);
            this._saveTimeout = null;
        }

        this._saveTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delayMs, () => {
            this._saveTimeout = null;
            this._saveSettings();
            return GLib.SOURCE_REMOVE;
        });
    }
    
    _calculateDifference() {
        let now = new Date();
        let diff = this._targetDate - now;
        
        if (diff < 0) {
            return { value: 0, isPast: true };
        }
        
        let seconds = Math.floor(diff / 1000);
        let minutes = Math.floor(seconds / 60);
        let hours = Math.floor(minutes / 60);
        let days = Math.floor(hours / 24);
        let weeks = Math.floor(days / 7);
        
        // Calculate months and years more accurately
        let years = 0;
        let months = 0;
        
        let tempDate = new Date(now);
        while (tempDate < this._targetDate) {
            tempDate.setFullYear(tempDate.getFullYear() + 1);
            if (tempDate <= this._targetDate) years++;
            else break;
        }
        
        tempDate = new Date(now);
        tempDate.setFullYear(tempDate.getFullYear() + years);
        while (tempDate < this._targetDate) {
            tempDate.setMonth(tempDate.getMonth() + 1);
            if (tempDate <= this._targetDate) months++;
            else break;
        }
        
        return {
            seconds: seconds,
            minutes: minutes,
            hours: hours,
            days: days,
            weeks: weeks,
            months: years * 12 + months,
            years: years,
            isPast: false
        };
    }
    
    _formatNumber(num) {
        if (this._numberFormat === NUMBER_FORMATS.NONE) {
            return num.toString();
        } else if (this._numberFormat === NUMBER_FORMATS.INDIAN) {
            // Indian number system: 1,00,000 (groups of 2 after first 3)
            let str = num.toString();
            let result = '';
            let len = str.length;
            
            if (len <= 3) return str;
            
            // Last 3 digits
            result = str.slice(-3);
            str = str.slice(0, -3);
            
            // Remaining digits in groups of 2
            while (str.length > 0) {
                if (str.length <= 2) {
                    result = str + ',' + result;
                    break;
                } else {
                    result = str.slice(-2) + ',' + result;
                    str = str.slice(0, -2);
                }
            }
            return result;
        } else {
            // International: 1,000,000 (groups of 3)
            return num.toLocaleString('en-US');
        }
    }
    
    _getCountdownText() {
        if (!this._targetDate) {
            return 'Set Date';
        }
        
        let diff = this._calculateDifference();
        
        if (diff.isPast) {
            return '💀 Time\'s Up';
        }
        
        let value = diff[this._currentUnit];
        let unit = this._currentUnit;
        
        // Format the display
        let icon = this._showIcon ? '⏱️ ' : '';
        let unitText = this._showUnitText ? ` ${unit}` : '';
        return `${icon}${this._formatNumber(value)}${unitText}`;
    }
    
    _updateDisplay() {
        this._label.set_text(this._getCountdownText());
    }
    
    _startTimer() {
        if (this._timeout) {
            GLib.source_remove(this._timeout);
        }
        
        this._timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            this._updateDisplay();
            return GLib.SOURCE_CONTINUE;
        });
    }
    
    _buildMenu() {
        // Current target date display
        this._dateMenuItem = new PopupMenu.PopupMenuItem('Not set', {
            reactive: false,
            style_class: 'death-clock-date-item'
        });
        this._updateDateDisplay();
        this.menu.addMenuItem(this._dateMenuItem);
        
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        
        // Set date option
        let setDateItem = new PopupMenu.PopupMenuItem('Set Date');
        setDateItem.connect('activate', () => {
            this._showDateDialog();
        });
        this.menu.addMenuItem(setDateItem);
        
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        
        // Time unit selection
        let unitsLabel = new PopupMenu.PopupMenuItem('Display Unit:', {
            reactive: false
        });
        this.menu.addMenuItem(unitsLabel);
        
        // Add radio items for each time unit
        this._unitMenuItems = {};
        Object.values(TIME_UNITS).forEach(unit => {
            let isSelected = this._currentUnit === unit;
            let item = new PopupMenu.PopupMenuItem(
                isSelected ? `✓ ${unit.charAt(0).toUpperCase() + unit.slice(1)}` : `   ${unit.charAt(0).toUpperCase() + unit.slice(1)}`
            );
            item.connect('activate', () => {
                this._currentUnit = unit;
                this._updateUnitMenuItems();
                this._updateDisplay();
                this._scheduleSave();
            });
            this.menu.addMenuItem(item);
            this._unitMenuItems[unit] = item;
        });
        
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        
        // Number format options
        let formatLabel = new PopupMenu.PopupMenuItem('Number Format:', {
            reactive: false
        });
        this.menu.addMenuItem(formatLabel);
        
        this._formatMenuItems = {};
        
        let noCommasItem = new PopupMenu.PopupMenuItem(
            this._numberFormat === NUMBER_FORMATS.NONE ? '✓ No Commas' : '   No Commas'
        );
        noCommasItem.connect('activate', () => {
            this._numberFormat = NUMBER_FORMATS.NONE;
            this._updateFormatMenuItems();
            this._updateDisplay();
            this._scheduleSave();
        });
        this.menu.addMenuItem(noCommasItem);
        this._formatMenuItems[NUMBER_FORMATS.NONE] = noCommasItem;
        
        let indianItem = new PopupMenu.PopupMenuItem(
            this._numberFormat === NUMBER_FORMATS.INDIAN ? '✓ Indian (1,00,000)' : '   Indian (1,00,000)'
        );
        indianItem.connect('activate', () => {
            this._numberFormat = NUMBER_FORMATS.INDIAN;
            this._updateFormatMenuItems();
            this._updateDisplay();
            this._scheduleSave();
        });
        this.menu.addMenuItem(indianItem);
        this._formatMenuItems[NUMBER_FORMATS.INDIAN] = indianItem;
        
        let intlItem = new PopupMenu.PopupMenuItem(
            this._numberFormat === NUMBER_FORMATS.INTERNATIONAL ? '✓ International (1,000,000)' : '   International (1,000,000)'
        );
        intlItem.connect('activate', () => {
            this._numberFormat = NUMBER_FORMATS.INTERNATIONAL;
            this._updateFormatMenuItems();
            this._updateDisplay();
            this._scheduleSave();
        });
        this.menu.addMenuItem(intlItem);
        this._formatMenuItems[NUMBER_FORMATS.INTERNATIONAL] = intlItem;
        
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        
        // Display options
        let displayLabel = new PopupMenu.PopupMenuItem('Display Options:', {
            reactive: false
        });
        this.menu.addMenuItem(displayLabel);
        
        // Toggle unit text
        let unitTextItem = new PopupMenu.PopupMenuItem(
            this._showUnitText ? '✓ Show Unit Text' : '   Show Unit Text'
        );
        unitTextItem.connect('activate', () => {
            this._showUnitText = !this._showUnitText;
            unitTextItem.label.text = this._showUnitText ? '✓ Show Unit Text' : '   Show Unit Text';
            this._updateDisplay();
            this._scheduleSave();
        });
        this.menu.addMenuItem(unitTextItem);
        
        // Toggle icon
        let iconItem = new PopupMenu.PopupMenuItem(
            this._showIcon ? '✓ Show Icon' : '   Show Icon'
        );
        iconItem.connect('activate', () => {
            this._showIcon = !this._showIcon;
            iconItem.label.text = this._showIcon ? '✓ Show Icon' : '   Show Icon';
            this._updateDisplay();
            this._scheduleSave();
        });
        this.menu.addMenuItem(iconItem);
    }
    
    _updateUnitMenuItems() {
        Object.entries(this._unitMenuItems).forEach(([unit, item]) => {
            let isSelected = this._currentUnit === unit;
            item.label.text = isSelected ? `✓ ${unit.charAt(0).toUpperCase() + unit.slice(1)}` : `   ${unit.charAt(0).toUpperCase() + unit.slice(1)}`;
        });
    }
    
    _updateFormatMenuItems() {
        this._formatMenuItems[NUMBER_FORMATS.NONE].label.text = 
            this._numberFormat === NUMBER_FORMATS.NONE ? '✓ No Commas' : '   No Commas';
        this._formatMenuItems[NUMBER_FORMATS.INDIAN].label.text = 
            this._numberFormat === NUMBER_FORMATS.INDIAN ? '✓ Indian (1,00,000)' : '   Indian (1,00,000)';
        this._formatMenuItems[NUMBER_FORMATS.INTERNATIONAL].label.text = 
            this._numberFormat === NUMBER_FORMATS.INTERNATIONAL ? '✓ International (1,000,000)' : '   International (1,000,000)';
    }
    
    _updateDateDisplay() {
        if (this._targetDate && this._dateMenuItem) {
            // Format as YYYY-MM-DD
            let year = this._targetDate.getFullYear();
            let month = String(this._targetDate.getMonth() + 1).padStart(2, '0');
            let day = String(this._targetDate.getDate()).padStart(2, '0');
            let dateStr = `📅 ${year}-${month}-${day}`;
            this._dateMenuItem.label.text = dateStr;
        }
    }
    
    _showDateDialog() {
        // Create a simple notification-based date input
        let currentDate = this._targetDate ? this._targetDate.toISOString().split('T')[0] : '';
        
        // Show notification with instructions
        Main.notify(
            'Death Clock',
            'Opening date input dialog...\nFormat: YYYY-MM-DD\nExample: 2100-12-31'
        );
        
        // Use a simple text entry dialog
        this._openDateEntryDialog();
    }
    
    _openDateEntryDialog() {
        let dialog = new ModalDialog.ModalDialog({
            styleClass: 'death-clock-dialog'
        });
        
        let content = new St.BoxLayout({
            vertical: true,
            style_class: 'death-clock-dialog-content'
        });
        
        let label = new St.Label({
            text: 'Enter date (YYYY-MM-DD):',
            style_class: 'death-clock-dialog-label'
        });
        content.add_child(label);
        
        let entry = new St.Entry({
            text: this._targetDate ? this._targetDate.toISOString().split('T')[0] : '',
            can_focus: true,
            style_class: 'death-clock-dialog-entry'
        });
        content.add_child(entry);
        
        dialog.contentLayout.add_child(content);
        
        dialog.addButton({
            label: 'Cancel',
            action: () => {
                dialog.close();
            },
            key: Clutter.KEY_Escape
        });
        
        dialog.addButton({
            label: 'Set Date',
            action: () => {
                let dateText = entry.get_text();
                let newDate = new Date(dateText);
                if (isNaN(newDate.getTime())) {
                    Main.notify('Death Clock', 'Invalid date format');
                } else if (newDate <= new Date()) {
                    Main.notify('Death Clock', 'Date must be in the future');
                } else {
                    this._targetDate = newDate;
                    this._updateDateDisplay();
                    this._updateDisplay();
                    this._scheduleSave();
                    Main.notify('Death Clock', `Date set to ${newDate.toISOString()}`);
                }
                dialog.close();
            },
            default: true
        });
        
        dialog.open();
        global.stage.set_key_focus(entry);
    }
    
    destroy() {
        // Flush any pending saves before destruction
        if (this._saveTimeout) {
            GLib.source_remove(this._saveTimeout);
            this._saveTimeout = null;
            this._saveSettings();
        }

        if (this._timeout) {
            GLib.source_remove(this._timeout);
            this._timeout = null;
        }
        super.destroy();
    }
});

export default class DeathClockExtension extends Extension {
    enable() {
        this._indicator = new DeathClockIndicator(this.path);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        this._indicator.destroy();
        this._indicator = null;
    }
}
