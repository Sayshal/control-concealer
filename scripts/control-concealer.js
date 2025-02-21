class ControlConcealer {
  constructor() {
    this.state = {
      view: 'prod',
      isEditMode: false
    };
    this.bindEventHandlers();
    this.initializeHooks();
  }

  // Core getters for commonly accessed elements
  get elements() {
    return {
      controls: document.getElementById('controls'),
      sidebar: document.getElementById('sidebar'),
      sidebarTabs: document.getElementById('sidebar-tabs'),
      controlConcealer: document.getElementById('control-concealer')
    };
  }

  get sceneControls() {
    return this.elements.controls.getElementsByClassName('scene-control');
  }

  get subControls() {
    return this.elements.controls.getElementsByClassName('sub-controls');
  }

  get sidebarItems() {
    return this.elements.sidebarTabs?.getElementsByClassName('item') ?? [];
  }

  get buttons() {
    return {
      config: $('#control-concealer .control-concealer-config'),
      dev: $('#control-concealer .control-concealer-dev'),
      prod: $('#control-concealer .control-concealer-prod')
    };
  }

  // Initialization methods
  initializeHooks() {
    Hooks.once('canvasReady', () => this.initialize());
    Hooks.on('renderSceneControls', (control, html, data) => this.onRenderSceneControls(control, html, data));
  }

  bindEventHandlers() {
    this.hideElement = this.hideElement.bind(this);
    this.hideSidebarElement = this.hideSidebarElement.bind(this);
  }

  async initialize() {
    await this.loadHiddenElements();
  }

  // UI Setup and Controls
  async onRenderSceneControls(control, html, data) {
    await this.addControls(html);
    await this.loadHiddenElements();

    if (!this.elements.controlConcealer) return;

    const configButton = this.elements.controlConcealer.getElementsByClassName('control-concealer-config')[0];
    if (configButton?.classList.contains('active')) {
      this.activateEditMode();
    }
  }

  async addControls(html) {
    const templateData = { myVar: 'Example value to be passed to handlebars' };
    const templatePath = '/modules/control-concealer/templates/controlConcealerUI.html';
    const controlHtml = await renderTemplate(templatePath, templateData);

    html.find('.main-controls').prepend(controlHtml);
    this.setupControlButtons(html);
    this.updateButtons();
  }

  setupControlButtons(html) {
    const buttons = {
      config: html.find('#control-concealer .control-concealer-config'),
      dev: html.find('#control-concealer .control-concealer-dev'),
      prod: html.find('#control-concealer .control-concealer-prod')
    };

    buttons.config.click(() => this.toggleEditMode());
    buttons.dev.click(() => this.setView('dev'));
    buttons.prod.click(() => this.setView('prod'));
  }

  // View and Button Management
  setView(newView) {
    if (this.state.isEditMode) {
      return ui.notifications.error('CONTROLCONCEALER.error.EditActive', { localize: true });
    }

    this.state.view = newView;
    $(document).find('.scene-control.active').click();
    this.updateButtons();
  }

  updateButtons() {
    const buttons = this.buttons;
    this.toggleActiveClass(buttons.dev[0], this.state.view === 'dev');
    this.toggleActiveClass(buttons.prod[0], this.state.view === 'prod');
    this.toggleActiveClass(buttons.config[0], this.state.isEditMode);
    this.loadHiddenElements();
  }

  toggleActiveClass(element, isActive) {
    element.classList.toggle('active', isActive);
  }

  // Edit Mode Management
  toggleEditMode() {
    this.state.isEditMode = !this.state.isEditMode;

    if (this.state.isEditMode) {
      this.activateEditMode();
      ui.notifications.info('CONTROLCONCEALER.info.EditModeActive', { localize: true });
    } else {
      this.deactivateEditMode();
      ui.notifications.info('CONTROLCONCEALER.info.EditModeEnd', { localize: true });
    }
  }

  activateEditMode() {
    this.elements.controls.classList.remove('hide-active');
    this.elements.sidebar.classList.remove('hide-active');
    this.addSidebarOverlay();
    $('#controls').find('li').contextmenu(this.hideElement);
  }

  deactivateEditMode() {
    this.saveHiddenElements();
    this.elements.controls.classList.add('hide-active');
    this.elements.sidebar.classList.add('hide-active');
    this.removeSidebarOverlay();
    $('#controls').find('li').off('contextmenu', this.hideElement);
  }

  // Element Management
  addSidebarOverlay() {
    const overlayCol = $('<div class="item-overlay-col tabs"></div>');
    $('#sidebar-tabs').append(overlayCol);

    const addOverlayItem = (element) => {
      const overlay = $('<div>&nbsp;</div>').addClass('item-overlay').attr('data-original-tab', $(element).data('tab')).contextmenu(this.hideSidebarElement);
      overlayCol.append(overlay);
    };

    $('#sidebar-tabs')
      .find('.item, .collapse')
      .each((_, element) => addOverlayItem(element));
  }

  removeSidebarOverlay() {
    $('#sidebar-tabs').find('.item-overlay-col').remove();
  }

  // Element Visibility and Color Management
  toggleHidden(element, value) {
    if (this.shouldSkipElement(element)) return;

    const shouldHide = value ?? !element.classList.contains('control-concealer-hide');
    element.classList.toggle('control-concealer-hide', shouldHide);

    if (shouldHide) {
      this.invertElementColor(element);
    } else {
      this.resetElementColor(element);
    }
  }

  resetAllHiddenStates() {
    const scenecontrols = this.sceneControls;
    const subcontrols = this.subControls;
    const sidebartabs = this.sidebarItems;

    [...scenecontrols].forEach((control) => this.toggleHidden(control, false));
    [...subcontrols].forEach((subcontrol) => [...subcontrol.getElementsByClassName('control-tool')].forEach((tool) => this.toggleHidden(tool, false)));
    [...sidebartabs].forEach((tab) => this.toggleHidden(tab, false));
  }

  shouldSkipElement(element) {
    return element.classList.contains('control-concealer-top') || element.classList.contains('control-concealer-tab') || element.id === 'control-concealer';
  }

  invertElementColor(element) {
    const style = window.getComputedStyle(element, null);
    const colors = {
      foreground: style.getPropertyValue('color'),
      background: style.getPropertyValue('background-color')
    };

    element.dataset.originalColor = colors.foreground;
    element.dataset.originalBackgroundColor = colors.background;

    element.style.color = this.invertColor(colors.foreground);
    element.style.backgroundColor = this.invertColor(colors.background);
  }

  resetElementColor(element) {
    if (element.dataset.originalColor) {
      element.style.color = element.dataset.originalColor;
    }
    if (element.dataset.originalBackgroundColor) {
      element.style.backgroundColor = element.dataset.originalBackgroundColor;
    }
  }

  invertColor(color) {
    if (!color.startsWith('rgb')) return color;

    const [type, values] = color.split('(');
    const numbers = values.slice(0, -1).split(',').map(Number);
    const inverted = numbers.map((value, i) => (i < 3 ? 255 - value : value));

    return `${type}(${inverted.join(',')})`;
  }

  // Data Management and Validation
  async saveHiddenElements() {
    const controls = { hidden: [], tools: [] };
    const hiddenTabs = [];

    // Process scene controls and tools
    Array.from(this.sceneControls).forEach((sceneControl, i) => {
      const controlData = this.getControlData(sceneControl, i);

      if (sceneControl.classList.contains('control-concealer-hide')) {
        controls.hidden.push(controlData);
        controls.tools.push({});
      } else {
        controls.hidden.push({});
        const toolsData = this.processTools(this.subControls[i], i, controlData);
        controls.tools.push(toolsData.hasHidden ? controlData : {});
      }
    });

    // Process sidebar tabs
    Array.from(this.sidebarItems).forEach((tab) => {
      if (tab.classList.contains('control-concealer-hide')) {
        hiddenTabs.push(tab.dataset.tab);
      }
    });

    const saveTab = this.state.view === 'dev' ? 'dev-tab' : 'prod-tab';
    await game.user.setFlag('control-concealer', saveTab, {
      hiddencontrols: controls.hidden,
      hiddentools: controls.tools,
      hiddentabs: hiddenTabs
    });
  }

  getControlData(control, index) {
    const data = {};
    const sourceControl = ui.controls.controls[index];

    Object.entries(sourceControl)
      .filter(([key]) => !['activeTool', 'tools', 'onClick'].includes(key))
      .forEach(([key, value]) => (data[key] = value));

    data.tools = [];
    return data;
  }

  processTools(subcontrol, controlIndex, controlData) {
    let hasHidden = false;
    const tools = subcontrol?.getElementsByClassName('control-tool') ?? [];

    Array.from(tools).forEach((tool, j) => {
      if (tool.classList.contains('control-concealer-hide')) {
        hasHidden = true;
        controlData.tools.push(this.getControlData(tool, j));
      } else {
        controlData.tools.push({});
      }
    });

    return { hasHidden, controlData };
  }

  async loadHiddenElements() {
    const saveTab = this.state.view === 'dev' ? 'dev-tab' : 'prod-tab';
    const tab = game.user.getFlag('control-concealer', saveTab) || {};
    if (Object.keys(tab).length === 0) return;

    this.resetAllHiddenStates();
    const validation = this.validateControls(tab.hiddencontrols, tab.hiddentools);

    if (validation.validControls.size > 0) {
      this.applyValidatedControls(validation.validControls);
    }

    this.applySidebarTabs(tab.hiddentabs);
    this.handleValidationResults(validation);
    this.updateDisplayState();
  }

  compareObject(source, target) {
    return Object.entries(source)
      .filter(([key]) => !['activeTool', 'tools', 'onClick'].includes(key))
      .every(([key, value]) => Object.prototype.hasOwnProperty.call(target, key) && target[key] === value);
  }

  validateControls(hiddenControls, hiddenTools) {
    const results = {
      hasMismatch: false,
      hasUnfixedMismatch: false,
      validControls: new Map()
    };

    hiddenControls.forEach((control, i) => {
      if (Object.keys(control).length === 0) return;

      const controlIndex = this.findControl(control);
      if (controlIndex === -1) {
        results.hasMismatch = results.hasUnfixedMismatch = true;
        console.log("Control concealer | couldn't find control:", control);
        return;
      }

      if (controlIndex !== i) results.hasMismatch = true;

      results.validControls.set(i, {
        originalIndex: i,
        newIndex: controlIndex,
        tools: this.validateTools(hiddenTools[i], controlIndex)
      });
    });

    return results;
  }

  findControl(target) {
    return ui.controls.controls.findIndex((control) => control.icon === target.icon && control.name === target.name && control.title === target.title);
  }

  findTool(target, ctrl_index) {
    if (!ui.controls.controls[ctrl_index]?.tools) return -1;

    return ui.controls.controls[ctrl_index].tools.findIndex((tool) => tool.icon === target.icon && tool.name === target.name && tool.title === target.title);
  }

  validateTools(tools, controlIndex) {
    const validTools = new Map();

    if (!tools || !tools.tools) return validTools;

    tools.tools.forEach((tool, i) => {
      if (Object.keys(tool).length === 0) return;

      const toolIndex = this.findTool(tool, controlIndex);
      if (toolIndex === -1) {
        console.log("Control concealer | couldn't find tool:", tool);
        return;
      }

      validTools.set(i, toolIndex);
    });

    return validTools;
  }

  applyValidatedControls(validControls) {
    const scenecontrols = this.sceneControls;
    const subcontrols = this.subControls;

    validControls.forEach((data, i) => {
      const control = scenecontrols[data.newIndex];
      if (control) {
        this.toggleHidden(control, true);

        if (data.tools.size > 0) {
          const tools = subcontrols[data.newIndex]?.getElementsByClassName('control-tool');
          if (tools) {
            data.tools.forEach((newIndex, originalIndex) => {
              if (tools[newIndex]) {
                this.toggleHidden(tools[newIndex], true);
              }
            });
          }
        }
      }
    });
  }

  applySidebarTabs(hiddentabs) {
    if (!hiddentabs?.length) return;

    const sidebartabs = Array.from(this.sidebarItems);
    hiddentabs.forEach((tabId) => {
      const tab = sidebartabs.find((element) => element.dataset.tab === tabId);
      if (tab) {
        this.toggleHidden(tab, true);
      } else {
        console.log("Control concealer | couldn't find sidebar tab:", tabId);
      }
    });
  }

  updateDisplayState() {
    this.elements.controls.classList.add('hide-active');
    this.elements.sidebar.classList.add('hide-active');
  }

  handleValidationResults(validation) {
    if (!validation.hasMismatch) return;

    if (validation.hasUnfixedMismatch) {
      ui.notifications.error('CONTROLCONCEALER.error.ControlMissmatch', { localize: true });
    } else {
      ui.notifications.warn('CONTROLCONCEALER.warning.ControlMissmatchFixed', { localize: true });
      this.saveHiddenElements();
    }
  }

  // Event Handlers
  hideElement(event) {
    this.toggleHidden(event.currentTarget);
    this.saveHiddenElements();
    return false;
  }

  hideSidebarElement(event) {
    const targetTab = $(event.currentTarget).attr('data-original-tab');
    const target = $(event.currentTarget).parent().parent().find(`.item[data-tab='${targetTab}']`)[0];
    this.toggleHidden(target);
    return false;
  }
}

// Initialize the module
(() => {
  const controlConcealer = new ControlConcealer();
})();
