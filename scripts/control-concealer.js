/**
 * Control Concealer Module
 * Allows hiding any UI elements in the Foundry VTT interface
 */
class ControlConcealer {
  static ID = 'control-concealer';

  static FLAGS = {
    PROFILES: 'profiles',
    ACTIVE_PROFILE: 'activeProfile'
  };

  static DEFAULT_PROFILES = {
    dev: { name: 'CONTROLCONCEALER.profile.dev', hiddenElements: {} },
    prod: { name: 'CONTROLCONCEALER.profile.prod', hiddenElements: {} }
  };

  static SETTINGS = {
    PROFILES: 'profiles'
  };

  // UI component selectors - these are the selectors for all UI elements we can hide
  static UI_SELECTORS = [
    // Scene controls
    '#controls',
    '.scene-control',
    '.control-tool',
    // Sidebar and tabs (separate each tab)
    '#sidebar',
    '#sidebar-tabs',
    '#sidebar-tabs .item[data-tab="chat"]',
    '#sidebar-tabs .item[data-tab="combat"]',
    '#sidebar-tabs .item[data-tab="scenes"]',
    '#sidebar-tabs .item[data-tab="actors"]',
    '#sidebar-tabs .item[data-tab="items"]',
    '#sidebar-tabs .item[data-tab="journal"]',
    '#sidebar-tabs .item[data-tab="tables"]',
    '#sidebar-tabs .item[data-tab="cards"]',
    '#sidebar-tabs .item[data-tab="playlists"]',
    '#sidebar-tabs .item[data-tab="compendium"]',
    '#sidebar-tabs .item[data-tab="settings"]',
    // Player list
    '#players',
    '#player-list .player',
    // Hotbar
    '#hotbar',
    '#hotbar .macro',
    '#hotbar .bar-controls',
    // UI buttons (top row)
    '#ui-top .scene-control',
    // Navigation
    '#navigation',
    '#nav-toggle',
    '#scene-list .scene',
    // Chat
    '#chat',
    '#chat-controls',
    '#chat-form',
    // Combat
    '#combat',
    '#combat-tracker',
    '#combat-controls',
    // Audio controls
    '#audio-controls',
    // UI right side
    '#ui-right .control',
    // Various other UI elements
    '#pause',
    '#fps',
    '#logo'
  ];

  static #instance = null;

  /**
   * Get the singleton instance of the module
   * @returns {ControlConcealer}
   */
  static getInstance() {
    if (!this.#instance) this.#instance = new ControlConcealer();
    return this.#instance;
  }

  /**
   * Main module initialization
   */
  static init() {
    Hooks.once('init', () => {
      game.settings.register(this.ID, this.SETTINGS.PROFILES, {
        name: 'Control Concealer Profiles',
        scope: 'client',
        config: false,
        type: Object,
        default: {}
      });

      // Load templates
      loadTemplates([`modules/${this.ID}/templates/profile-buttons.hbs`]);
    });

    Hooks.once('ready', () => {
      this.getInstance().initialize();
    });

    // Register hooks for all UI renderings
    Hooks.on('renderSceneControls', (app, html, data) => {
      this.getInstance().onRenderUI(app, html, data);
    });

    Hooks.on('renderUI', (app, html, data) => {
      this.getInstance().onRenderUI(app, html, data);
    });

    // For elements that might be dynamically added
    Hooks.on('renderHotbar', () => this.getInstance().applyProfile());
    Hooks.on('renderPlayerList', () => this.getInstance().applyProfile());
    Hooks.on('renderChatLog', () => this.getInstance().applyProfile());
    Hooks.on('renderCombatTracker', () => this.getInstance().applyProfile());
    Hooks.on('canvasReady', () => this.getInstance().addProfileButtons());
    Hooks.on('renderSceneNavigation', () => this.getInstance().addProfileButtons());
    Hooks.on('renderSceneControls', () => this.getInstance().addProfileButtons());
  }

  constructor() {
    this.editing = false;
    this.activeProfile = 'prod'; // Default to production
    this.profiles = this.getProfiles();
    this.addedButtons = false;
  }

  /**
   * Initialize the module
   */
  initialize() {
    // Migrate older data format if needed
    this.migrateOldFormat();

    // Get active profile from user flags
    const activeProfile = game.user.getFlag(ControlConcealer.ID, ControlConcealer.FLAGS.ACTIVE_PROFILE);
    if (activeProfile) {
      this.activeProfile = activeProfile;
    }

    // Add profile buttons to UI
    this.addProfileButtons();

    // Apply current profile
    this.applyProfile();
  }

  /**
   * Handle UI rendering
   */
  onRenderUI(app, html, data) {
    // Make sure our profile buttons exist
    if (!this.addedButtons) {
      this.addProfileButtons();
    }

    // Apply profile settings
    this.applyProfile();

    // Setup edit mode listeners if in edit mode
    if (this.editing) {
      this.setupEditModeListeners();
    }
  }

  /**
   * Add profile buttons to the UI
   */
  addProfileButtons() {
    // If the buttons are already there, no need to add them again
    if ($('#control-concealer').length > 0) return;

    const $controls = $('#controls');
    if (!$controls.length) return;

    const $mainControls = $controls.find('.main-controls');
    if (!$mainControls.length) return;

    this.renderProfileButtons($mainControls);
    this.addedButtons = true;

    // Set up a MutationObserver to detect when our buttons are removed
    this.setupButtonObserver($mainControls);
  }

  setupButtonObserver(target) {
    // Create a MutationObserver to watch for our buttons being removed
    const observer = new MutationObserver((mutations) => {
      if ($('#control-concealer').length === 0) {
        // Our buttons were removed, add them back
        this.renderProfileButtons(target);
      }
    });

    // Start observing the target
    observer.observe(target[0], { childList: true, subtree: true });
  }

  /**
   * Render the profile selection buttons
   */
  async renderProfileButtons(target) {
    const templateData = {
      activeProfile: this.activeProfile,
      editing: this.editing,
      profiles: Object.entries(this.profiles).map(([id, profile]) => {
        return {
          id,
          name: game.i18n.localize(profile.name),
          active: id === this.activeProfile
        };
      }),
      showResetButton: true
    };

    const html = await renderTemplate(`modules/${ControlConcealer.ID}/templates/profile-buttons.hbs`, templateData);
    target.append(html);

    // Attach event listeners
    const container = target.find('#control-concealer');
    container.find('.profile-button').click(this.#onProfileButtonClick.bind(this));
    container.find('.edit-button').click(this.#onEditButtonClick.bind(this));
    container.find('.reset-button').click(() => this.resetActiveProfile());
  }

  /**
   * Setup listeners for edit mode
   */
  setupEditModeListeners() {
    // Remove any existing right-click handlers first
    $(document).off('contextmenu.control-concealer');

    // Add right-click handlers to all UI elements
    $(document).on('contextmenu.control-concealer', ControlConcealer.UI_SELECTORS.join(', '), this.#onRightClickElement.bind(this));

    // Also prevent context menu globally when in edit mode
    $(document).on('contextmenu.control-concealer-global', (event) => {
      if (this.editing) {
        event.preventDefault();
        return false;
      }
    });

    // Special handling for hotbar elements that have built-in context menus
    $('#hotbar .macro').on('contextmenu.control-concealer-hotbar', (event) => {
      if (this.editing) {
        event.preventDefault();
        event.stopPropagation();

        const $target = $(event.currentTarget);
        $target.toggleClass('control-concealer-hide');

        return false;
      }
    });

    // Special handling for sidebar tabs
    $('#sidebar-tabs .item').on('contextmenu.control-concealer-sidebar', (event) => {
      if (this.editing) {
        event.preventDefault();
        event.stopPropagation();

        const $target = $(event.currentTarget);
        $target.toggleClass('control-concealer-hide');

        return false;
      }
    });

    // Apply visual indicators for already hidden elements
    this.applyVisualState();
  }

  /**
   * Apply the current hidden state visually (for edit mode)
   */
  applyVisualState() {
    const profile = this.profiles[this.activeProfile];
    if (!profile) return;

    // Reset all visual states
    $(ControlConcealer.UI_SELECTORS.join(', ')).removeClass('control-concealer-hide');

    // Apply hidden elements
    Object.entries(profile.hiddenElements || {}).forEach(([selector, isHidden]) => {
      if (isHidden) {
        $(selector).addClass('control-concealer-hide');
      }
    });
  }

  /**
   * Apply the selected profile
   */
  applyProfile(profileId) {
    if (profileId) {
      if (this.editing) {
        ui.notifications.error(game.i18n.localize('CONTROLCONCEALER.error.EditActive'));
        return;
      }

      if (this.profiles[profileId]) {
        this.activeProfile = profileId;
        game.user.setFlag(ControlConcealer.ID, ControlConcealer.FLAGS.ACTIVE_PROFILE, profileId);

        // Update the active button state
        $('#control-concealer .profile-button').removeClass('active');
        $(`#control-concealer .profile-button[data-profile="${profileId}"]`).addClass('active');
      }
    }

    const profile = this.profiles[this.activeProfile];
    if (!profile) return;

    // Reset visibility for all UI elements
    $(ControlConcealer.UI_SELECTORS.join(', ')).removeClass('control-concealer-hide');

    if (!this.editing) {
      // Add hide-active class to actually hide elements
      $('body').addClass('cc-hide-active');

      // Apply hidden elements
      Object.entries(profile.hiddenElements || {}).forEach(([selector, isHidden]) => {
        if (isHidden) {
          // For sidebar tabs, we need special handling
          if (selector.startsWith('#sidebar-tabs .item[data-tab=')) {
            // Mark tab for hiding without affecting the sidebar itself
            $(selector).addClass('control-concealer-hide');
          } else {
            $(selector).addClass('control-concealer-hide');
          }
        }
      });
    } else {
      // In edit mode, show all elements but apply visual indicators
      $('body').removeClass('cc-hide-active');
      this.applyVisualState();
    }
  }

  /**
   * Reset the currently active profile by unhiding all elements
   */
  resetActiveProfile() {
    if (!this.profiles[this.activeProfile]) return;

    // Reset to empty hidden elements object
    this.profiles[this.activeProfile].hiddenElements = {};

    // Save profiles
    this.saveProfiles();

    // Reapply the profile to update the UI
    this.applyProfile(this.activeProfile);

    ui.notifications.info(`Profile "${game.i18n.localize(this.profiles[this.activeProfile].name)}" has been reset. All elements are now visible.`);
  }

  /**
   * Toggle edit mode
   */
  toggleEditMode() {
    this.editing = !this.editing;

    if (this.editing) {
      // Start editing
      $('body').removeClass('cc-hide-active');
      ui.notifications.info(game.i18n.localize('CONTROLCONCEALER.info.EditModeActive'));
      this.setupEditModeListeners();
    } else {
      // End editing
      this.saveCurrentProfile();
      $('body').addClass('cc-hide-active');
      ui.notifications.info(game.i18n.localize('CONTROLCONCEALER.info.EditModeEnd'));

      // Remove the contextmenu event handlers
      $(document).off('contextmenu.control-concealer');
      $(document).off('contextmenu.control-concealer-global');
      $('#hotbar .macro').off('contextmenu.control-concealer-hotbar');
      $('#sidebar-tabs .item').off('contextmenu.control-concealer-sidebar');
    }

    // Update button state
    const $editButton = $('#control-concealer .edit-button');
    $editButton.toggleClass('active', this.editing);

    // Refresh profile
    this.applyProfile();
  }

  /**
   * Save the current profile
   */
  saveCurrentProfile() {
    const hiddenElements = {};

    // For each UI selector, check if any matching elements are hidden
    ControlConcealer.UI_SELECTORS.forEach((selector) => {
      const $elements = $(selector);
      if ($elements.length) {
        hiddenElements[selector] = $elements.hasClass('control-concealer-hide');
      }
    });

    // Update profile
    this.profiles[this.activeProfile] = {
      ...this.profiles[this.activeProfile],
      hiddenElements
    };

    // Save to user's settings
    this.saveProfiles();
  }

  /**
   * Get profiles from settings
   */
  getProfiles() {
    // Get saved profiles or use defaults
    const savedProfiles = game.settings.get(ControlConcealer.ID, ControlConcealer.SETTINGS.PROFILES);

    // Merge with defaults to ensure all default profiles exist
    return foundry.utils.mergeObject(foundry.utils.deepClone(ControlConcealer.DEFAULT_PROFILES), savedProfiles || {});
  }

  /**
   * Save profiles to settings
   */
  saveProfiles() {
    game.settings.set(ControlConcealer.ID, ControlConcealer.SETTINGS.PROFILES, this.profiles);
  }

  /**
   * Migrate data from old format if needed
   */
  migrateOldFormat() {
    const devTab = game.user.getFlag(ControlConcealer.ID, 'dev-tab');
    const prodTab = game.user.getFlag(ControlConcealer.ID, 'prod-tab');

    if (devTab || prodTab) {
      if (devTab) {
        const hiddenElements = {};

        // Convert old data structure to new format
        Object.entries(devTab.hiddencontrols || {}).forEach(([index, controlData]) => {
          if (Object.keys(controlData).length > 0) {
            hiddenElements[`.scene-control:nth-child(${parseInt(index) + 1})`] = true;
          }
        });

        Object.entries(devTab.hiddentools || {}).forEach(([controlIndex, toolsData]) => {
          if (Object.keys(toolsData).length > 0 && toolsData.tools) {
            toolsData.tools.forEach((toolData, toolIndex) => {
              if (Object.keys(toolData).length > 0) {
                hiddenElements[`.scene-control:nth-child(${parseInt(controlIndex) + 1}) + .sub-controls .control-tool:nth-child(${parseInt(toolIndex) + 1})`] = true;
              }
            });
          }
        });

        (devTab.hiddentabs || []).forEach((tabId) => {
          hiddenElements[`#sidebar-tabs .item[data-tab="${tabId}"]`] = true;
        });

        this.profiles.dev = {
          name: 'CONTROLCONCEALER.profile.dev',
          hiddenElements
        };
      }

      if (prodTab) {
        const hiddenElements = {};

        // Convert old data structure to new format
        Object.entries(prodTab.hiddencontrols || {}).forEach(([index, controlData]) => {
          if (Object.keys(controlData).length > 0) {
            hiddenElements[`.scene-control:nth-child(${parseInt(index) + 1})`] = true;
          }
        });

        Object.entries(prodTab.hiddentools || {}).forEach(([controlIndex, toolsData]) => {
          if (Object.keys(toolsData).length > 0 && toolsData.tools) {
            toolsData.tools.forEach((toolData, toolIndex) => {
              if (Object.keys(toolData).length > 0) {
                hiddenElements[`.scene-control:nth-child(${parseInt(controlIndex) + 1}) + .sub-controls .control-tool:nth-child(${parseInt(toolIndex) + 1})`] = true;
              }
            });
          }
        });

        (prodTab.hiddentabs || []).forEach((tabId) => {
          hiddenElements[`#sidebar-tabs .item[data-tab="${tabId}"]`] = true;
        });

        this.profiles.prod = {
          name: 'CONTROLCONCEALER.profile.prod',
          hiddenElements
        };
      }

      // Save migrated data
      this.saveProfiles();

      // Clean up old flags
      game.user.unsetFlag(ControlConcealer.ID, 'dev-tab');
      game.user.unsetFlag(ControlConcealer.ID, 'prod-tab');
    }
  }

  /**
   * Handle profile button click
   */
  #onProfileButtonClick(event) {
    event.preventDefault();
    const profileId = event.currentTarget.dataset.profile;

    // Update active button visually before applying profile
    $('#control-concealer .profile-button').removeClass('active');
    $(event.currentTarget).addClass('active');

    this.applyProfile(profileId);
  }

  /**
   * Handle edit button click
   */
  #onEditButtonClick(event) {
    event.preventDefault();
    this.toggleEditMode();
  }

  /**
   * Handle right-click on any UI element
   */
  #onRightClickElement(event) {
    event.preventDefault();
    event.stopPropagation();

    // Get the clicked element
    const $target = $(event.currentTarget);

    // Toggle the hidden state
    $target.toggleClass('control-concealer-hide');

    return false; // This already exists, which is good
  }
}

// Initialize the module
ControlConcealer.init();
