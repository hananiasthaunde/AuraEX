(() => {
  'use strict';

  const STORAGE_KEY = 'auraex-dashboard-data-v2';
  const SETTINGS_KEY = 'auraex-dashboard-settings-v2';
  const ONBOARDING_KEY = 'auraex-onboarding-seen-v3';
  const API_TOKEN_KEY = 'auraex-api-token-session-v1';
  const VIEW_TITLES = {
    overview: 'Visão geral',
    mentees: 'Mentorados',
    sessions: 'Tabela de sessões',
    agenda: 'Agenda e marcações',
    companies: 'Empresas',
    raw: 'Planilha',
    settings: 'Configurações'
  };

  const ONBOARDING_SLIDES = [
    {
      title: 'Bem-vindo ao AuraEX',
      text: 'A plataforma transforma a planilha de mentorados numa experiência visual, simples e protegida por login.',
      points: ['Use o menu lateral para navegar.', 'Escolha o programa no topo da página.', 'As alterações ficam guardadas automaticamente no servidor.'],
      art: '<div class="art-dashboard"><div class="art-bar"><i></i><strong>AuraEX</strong></div><div class="art-cards"><i></i><i></i><i></i></div><div class="art-table"></div></div>'
    },
    {
      title: 'Atualize sessões numa tabela grande',
      text: 'A Tabela de sessões reúne todos os mentorados numa visão horizontal. Basta clicar no campo e escrever a marcação.',
      points: ['“ok” significa sessão concluída.', 'Uma data e hora significam sessão agendada.', 'Qualquer observação é tratada como pendência.'],
      art: '<div class="art-dashboard"><div class="art-table"></div><div class="art-cards"><i></i><i></i><i></i></div></div>'
    },
    {
      title: 'Veja dias no calendário ou em tabela',
      text: 'A área Agenda e marcações possui duas formas de consulta: calendário mensal e tabela completa.',
      points: ['Navegue entre os meses.', 'Filtre por empresa ou mentorado.', 'Abra o registo diretamente a partir da marcação.'],
      art: '<div class="art-calendar">' + '<i></i>'.repeat(35) + '</div>'
    },
    {
      title: 'Gere um Excel profissional',
      text: 'Ao exportar, escolha Relatório organizado. O sistema cria um ficheiro bonito com Resumo, Mentorados, Sessões, Agenda, Empresas e Base original.',
      points: ['Cabeçalhos e cores padronizados.', 'Filtros e painéis congelados.', 'Pronto para partilhar ou continuar a editar.'],
      art: '<div class="art-excel"><h4>AuraEX — Relatório de Mentorias</h4>' + '<div></div>'.repeat(9) + '</div>'
    }
  ];

  const els = {};
  let workbook = loadWorkbook();
  let settings = loadSettings();
  let activeSheetName = workbook.sheets.find(sheet => sheet.name === '2026')?.name || workbook.sheets[0]?.name || '';
  let currentView = 'overview';
  let agendaMode = 'calendar';
  let calendarCursor = new Date();
  let onboardingStep = 0;
  let saveTimer = null;
  let exportBusy = false;
  let authSession = null;

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    cacheElements();
    if (!(await loadAuthSession())) return;
    bindEvents();
    hydrateSettings();
    hydrateAuthenticatedUser();
    renderSheetPicker();
    updateSourceLabels();
    navigate('overview');
    if (settings.apiUrl) await loadFromApiOnStart();
    await loadTokens();
    if (localStorage.getItem(ONBOARDING_KEY) !== 'true') setTimeout(() => openOnboarding(), 350);
  }

  function cacheElements() {
    [
      'sidebar','sidebarClose','mobileOverlay','mobileMenu','pageTitle','sheetSelect','helpBtn','sidebarHelpBtn',
      'importBtn','exportBtn','quickExport','fileInput','notice','statsGrid','upcomingList','companyChart',
      'heroNextCount','heroProgress','heroProgressBar','searchInput','companyFilter','statusFilter','clearMenteeFilters',
      'menteesTableBody','tableCount','sessionSearch','sessionCompanyFilter','sessionStatusFilter','compactMatrix',
      'sessionMatrix','matrixCard','matrixCount','markLegendBtn','legendBackdrop','closeLegend','agendaSearch',
      'agendaCompanyFilter','prevMonth','nextMonth','todayBtn','calendarMonthLabel','calendarGrid','undatedAgenda',
      'agendaCalendarWrap','agendaTableWrap','agendaTableBody','agendaTableCount','companiesGrid','rawTable',
      'addRawRowBtn','addRawColumnBtn','sourceFileSidebar','apiUrl','apiToken','autoSync','saveSettingsBtn','syncNowBtn',
      'backupBtn','restoreBackupBtn','backupInput','resetBtn','reopenOnboardingBtn','resetOnboardingBtn',
      'userAvatar','currentUserName','currentUserRole','logoutBtn','sidebarUserAvatar','sidebarUserName','sidebarUserRole','sidebarLogoutBtn',
      'mcpEndpoint','copyMcpEndpointBtn','tokenName',
      'tokenExpiry','tokenWriteScope','createTokenBtn','newTokenPanel','newTokenValue','copyNewTokenBtn','hideNewTokenBtn',
      'tokenList','passwordForm','currentPassword','newPassword','confirmPassword','changePasswordBtn',
      'modalBackdrop','closeModal','cancelModal','menteeForm','editRowIndex','formName','formCompany','formEmail',
      'formPhone','formPrevious','formNext','formObservation','formPartial','formAgenda','formClosure','formReport',
      'previousField','nextField','observationField','partialField','agendaField','sessionFields','deleteBtn','modalTitle',
      'onboardingBackdrop','closeOnboarding','onboardingProgress','onboardingContent','dontShowOnboarding',
      'onboardingPrev','onboardingNext','exportBackdrop','closeExportModal','exportBeautifulBtn','exportRawBtn','toastContainer'
    ].forEach(id => { els[id] = document.getElementById(id); });
  }

  function bindEvents() {
    document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => navigate(button.dataset.view)));
    document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.go)));
    document.querySelectorAll('[data-open-add]').forEach(button => button.addEventListener('click', () => openMenteeModal(null)));

    els.mobileMenu.addEventListener('click', openMobileMenu);
    els.sidebarClose.addEventListener('click', closeMobileMenu);
    els.mobileOverlay.addEventListener('click', closeMobileMenu);
    els.logoutBtn?.addEventListener('click', logout);
    els.sidebarLogoutBtn?.addEventListener('click', logout);
    els.copyMcpEndpointBtn.addEventListener('click', () => copyText(els.mcpEndpoint.value, 'Endpoint MCP copiado.'));
    els.createTokenBtn.addEventListener('click', createPersonalToken);
    els.copyNewTokenBtn.addEventListener('click', () => copyText(els.newTokenValue.textContent, 'Token copiado.'));
    els.hideNewTokenBtn.addEventListener('click', () => { els.newTokenPanel.hidden = true; els.newTokenValue.textContent = ''; });
    els.tokenList.addEventListener('click', event => { const button = event.target.closest('[data-revoke-token]'); if (button) revokePersonalToken(button.dataset.revokeToken); });
    els.passwordForm.addEventListener('submit', changeAccountPassword);
    els.helpBtn.addEventListener('click', () => openOnboarding(true));
    els.sidebarHelpBtn.addEventListener('click', () => openOnboarding(true));
    els.reopenOnboardingBtn.addEventListener('click', () => openOnboarding(true));
    els.resetOnboardingBtn.addEventListener('click', () => {
      localStorage.removeItem(ONBOARDING_KEY);
      toast('O guia será apresentado no próximo acesso.', 'success');
    });

    els.sheetSelect.addEventListener('change', () => {
      activeSheetName = els.sheetSelect.value;
      renderCurrentView();
    });
    els.importBtn.addEventListener('click', () => els.fileInput.click());
    els.fileInput.addEventListener('change', importExcel);
    els.exportBtn.addEventListener('click', openExportModal);
    els.quickExport.addEventListener('click', openExportModal);

    [els.searchInput, els.companyFilter, els.statusFilter].forEach(input => input.addEventListener(input.tagName === 'INPUT' ? 'input' : 'change', renderMentees));
    els.clearMenteeFilters.addEventListener('click', () => {
      els.searchInput.value = '';
      els.companyFilter.value = '';
      els.statusFilter.value = '';
      renderMentees();
    });

    els.sessionSearch.addEventListener('input', renderSessionsMatrix);
    els.sessionCompanyFilter.addEventListener('change', renderSessionsMatrix);
    els.sessionStatusFilter.addEventListener('change', renderSessionsMatrix);
    els.compactMatrix.addEventListener('change', () => els.matrixCard.classList.toggle('compact', els.compactMatrix.checked));
    els.sessionMatrix.addEventListener('focusout', handleSessionInputBlur);
    els.sessionMatrix.addEventListener('keydown', event => {
      if (event.target.matches('.session-input') && event.key === 'Enter') {
        event.preventDefault();
        event.target.blur();
      }
    });
    els.sessionMatrix.addEventListener('click', handleSessionMatrixClick);
    els.markLegendBtn.addEventListener('click', () => { els.legendBackdrop.hidden = false; });
    els.closeLegend.addEventListener('click', () => { els.legendBackdrop.hidden = true; });
    els.legendBackdrop.addEventListener('click', event => { if (event.target === els.legendBackdrop) els.legendBackdrop.hidden = true; });

    document.querySelectorAll('[data-agenda-mode]').forEach(button => button.addEventListener('click', () => setAgendaMode(button.dataset.agendaMode)));
    els.prevMonth.addEventListener('click', () => changeMonth(-1));
    els.nextMonth.addEventListener('click', () => changeMonth(1));
    els.todayBtn.addEventListener('click', () => { calendarCursor = new Date(); renderAgenda(); });
    els.agendaSearch.addEventListener('input', renderAgenda);
    els.agendaCompanyFilter.addEventListener('change', renderAgenda);

    els.addRawRowBtn.addEventListener('click', addRawRow);
    els.addRawColumnBtn.addEventListener('click', addRawColumn);

    els.closeModal.addEventListener('click', closeMenteeModal);
    els.cancelModal.addEventListener('click', closeMenteeModal);
    els.modalBackdrop.addEventListener('click', event => { if (event.target === els.modalBackdrop) closeMenteeModal(); });
    els.menteeForm.addEventListener('submit', saveMenteeFromForm);
    els.deleteBtn.addEventListener('click', deleteCurrentMentee);
    document.querySelectorAll('[data-form-tab]').forEach(button => button.addEventListener('click', () => setFormTab(button.dataset.formTab)));

    els.backupBtn.addEventListener('click', downloadBackup);
    els.restoreBackupBtn.addEventListener('click', () => els.backupInput.click());
    els.backupInput.addEventListener('change', restoreBackup);
    els.resetBtn.addEventListener('click', resetData);
    els.saveSettingsBtn.addEventListener('click', saveSettings);
    els.syncNowBtn.addEventListener('click', syncNow);

    els.closeOnboarding.addEventListener('click', closeOnboarding);
    els.onboardingPrev.addEventListener('click', () => { if (onboardingStep > 0) { onboardingStep -= 1; renderOnboarding(); } });
    els.onboardingNext.addEventListener('click', advanceOnboarding);
    els.onboardingBackdrop.addEventListener('click', event => { if (event.target === els.onboardingBackdrop) closeOnboarding(); });

    els.closeExportModal.addEventListener('click', closeExportModal);
    els.exportBackdrop.addEventListener('click', event => { if (event.target === els.exportBackdrop) closeExportModal(); });
    els.exportBeautifulBtn.addEventListener('click', () => exportExcel('beautiful'));
    els.exportRawBtn.addEventListener('click', () => exportExcel('raw'));

    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      if (!els.legendBackdrop.hidden) els.legendBackdrop.hidden = true;
      else if (!els.exportBackdrop.hidden) closeExportModal();
      else if (!els.onboardingBackdrop.hidden) closeOnboarding();
      else if (!els.modalBackdrop.hidden) closeMenteeModal();
      else closeMobileMenu();
    });
  }

  function openMobileMenu() {
    els.sidebar.classList.add('open');
    els.mobileOverlay.classList.add('open');
  }

  function closeMobileMenu() {
    els.sidebar.classList.remove('open');
    els.mobileOverlay.classList.remove('open');
  }

  async function loadFromApiOnStart() {
    try {
      const response = await apiFetch(settings.apiUrl, { method: 'GET', headers: { Accept: 'application/json' } });
      if (!response.ok) return;
      const remote = await response.json();
      if (!Array.isArray(remote.sheets)) return;
      workbook = remote;
      activeSheetName = workbook.sheets.find(sheet => sheet.name === activeSheetName)?.name || workbook.sheets.find(sheet => sheet.name === '2026')?.name || workbook.sheets[0]?.name || '';
      localStorage.setItem(STORAGE_KEY, JSON.stringify(workbook));
      renderSheetPicker();
      updateSourceLabels();
      renderCurrentView();
      toast('Dados sincronizados com o servidor.', 'success');
    } catch (error) {
      console.info('Servidor opcional não disponível:', error.message);
    }
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function loadWorkbook() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.sheets)) return parsed;
      }
    } catch (error) {
      console.warn('Não foi possível carregar os dados guardados:', error);
    }
    return deepClone(window.AURA_INITIAL_DATA || { workbookName: 'Mentorados.xlsx', sheets: [] });
  }

  function loadSettings() {
    const serverDefaults = location.protocol.startsWith('http')
      ? { apiUrl: '/api/mentorados', autoSync: true, apiToken: sessionStorage.getItem(API_TOKEN_KEY) || '' }
      : { apiUrl: '', autoSync: false, apiToken: '' };
    try { return { ...serverDefaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'), apiToken: sessionStorage.getItem(API_TOKEN_KEY) || '' }; }
    catch { return serverDefaults; }
  }

  function persistData(message) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(workbook));
      if (message) toast(message, 'success');
      if (settings.autoSync && settings.apiUrl) {
        try { await postToApi(); }
        catch (error) { toast(`Guardado localmente, mas a API falhou: ${error.message}`, 'error'); }
      }
    }, 160);
  }

  function currentSheet() {
    return workbook.sheets.find(sheet => sheet.name === activeSheetName) || workbook.sheets[0];
  }

  function ensureLayout(sheet) {
    if (!sheet.layout || sheet.layout.nameCol === undefined) sheet.layout = window.AuraExcel.inferLayout(sheet.name, sheet.rows || []);
    if (!Array.isArray(sheet.layout.sessionCols)) sheet.layout.sessionCols = [];
    if (!Array.isArray(sheet.layout.sessionLabels)) sheet.layout.sessionLabels = sheet.layout.sessionCols.map((_, index) => `Sessão ${index + 1}`);
    return sheet.layout;
  }

  function renderSheetPicker() {
    els.sheetSelect.innerHTML = workbook.sheets.map(sheet => `<option value="${escapeAttr(sheet.name)}">${escapeHtml(sheet.name)}</option>`).join('');
    if (!workbook.sheets.some(sheet => sheet.name === activeSheetName)) activeSheetName = workbook.sheets[0]?.name || '';
    els.sheetSelect.value = activeSheetName;
  }

  function updateSourceLabels() {
    els.sourceFileSidebar.textContent = workbook.workbookName || 'Excel';
  }

  function navigate(view) {
    currentView = VIEW_TITLES[view] ? view : 'overview';
    document.querySelectorAll('.view').forEach(section => section.classList.toggle('active', section.id === `view-${currentView}`));
    document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === currentView));
    els.pageTitle.textContent = VIEW_TITLES[currentView];
    closeMobileMenu();
    renderCurrentView();
  }

  function renderCurrentView() {
    const sheet = currentSheet();
    if (!sheet) {
      els.notice.hidden = false;
      els.notice.textContent = 'Nenhuma planilha disponível. Importe um ficheiro Excel para começar.';
      return;
    }
    els.notice.hidden = true;
    ensureLayout(sheet);
    if (currentView === 'overview') renderOverview();
    else if (currentView === 'mentees') renderMentees();
    else if (currentView === 'sessions') renderSessionsMatrix();
    else if (currentView === 'agenda') renderAgenda();
    else if (currentView === 'companies') renderCompanies();
    else if (currentView === 'raw') renderRawTable();
  }

  function getCell(row, col) {
    if (col === undefined || col === null || !Array.isArray(row)) return '';
    return row[col] ?? '';
  }

  function setCell(row, col, value) {
    if (col === undefined || col === null) return;
    while (row.length <= col) row.push(null);
    row[col] = value === '' ? null : value;
  }

  function normalized(value) {
    return String(value ?? '').trim().toLowerCase();
  }

  function isCompleteValue(value) {
    const v = normalized(value);
    if (!v) return false;
    return ['ok','okay','sim','concluído','concluido','concluída','concluida','feito','realizada','realizado','encerrou','encerrado','encerramento','finalizado','finalizada'].includes(v);
  }

  function isClosureComplete(value) {
    const v = normalized(value);
    return isCompleteValue(v) || v.includes('encerrad') || v.includes('finaliz');
  }

  function classifySession(value) {
    const v = String(value ?? '').trim();
    if (!v) return 'empty';
    if (isCompleteValue(v)) return 'done';
    if (parseDateValue(v)) return 'scheduled';
    return 'pending';
  }

  function recordsForSheet(sheet = currentSheet()) {
    if (!sheet) return [];
    const layout = ensureLayout(sheet);
    const rows = sheet.rows || [];
    const records = [];
    for (let rowIndex = Number(layout.dataStart || 0); rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] || [];
      const name = String(getCell(row, layout.nameCol)).trim();
      if (!name) continue;
      const sessionValues = layout.sessionCols.map(col => getCell(row, col));
      const completed = sessionValues.filter(isCompleteValue).length;
      const total = layout.sessionCols.length || 12;
      let nextStep = '';
      let nextLabel = '';
      if (layout.nextCol !== undefined && getCell(row, layout.nextCol) && !isCompleteValue(getCell(row, layout.nextCol))) {
        nextStep = String(getCell(row, layout.nextCol));
        nextLabel = 'Próxima data';
      }
      if (!nextStep) {
        for (let index = 0; index < sessionValues.length; index += 1) {
          if (sessionValues[index] && !isCompleteValue(sessionValues[index])) {
            nextStep = String(sessionValues[index]);
            nextLabel = layout.sessionLabels[index] || `Sessão ${index + 1}`;
            break;
          }
        }
      }
      if (!nextStep && layout.agendaCol !== undefined && getCell(row, layout.agendaCol)) {
        nextStep = String(getCell(row, layout.agendaCol));
        nextLabel = 'Agenda';
      }
      const closure = getCell(row, layout.closureCol);
      const report = getCell(row, layout.reportCol);
      const completedStatus = (completed >= layout.sessionCols.length && layout.sessionCols.length > 0) || isClosureComplete(closure);
      const status = completedStatus ? 'completed' : (completed > 0 || nextStep ? 'in-progress' : 'not-started');
      records.push({
        rowIndex,
        row,
        id: getCell(row, layout.idCol) || rowIndex,
        name,
        email: String(getCell(row, layout.emailCol)).trim(),
        phone: String(getCell(row, layout.phoneCol)).trim(),
        company: String(getCell(row, layout.companyCol)).trim() || 'Sem empresa',
        sessionValues,
        completed,
        total,
        progress: total ? Math.round((completed / total) * 100) : 0,
        nextStep,
        nextLabel,
        previous: getCell(row, layout.previousCol),
        observation: getCell(row, layout.observationCol),
        partial: getCell(row, layout.partialCol),
        agenda: getCell(row, layout.agendaCol),
        closure,
        report,
        status
      });
    }
    return records;
  }

  function renderOverview() {
    const records = recordsForSheet();
    const companies = groupCompanies(records);
    const completedSessions = records.reduce((sum, record) => sum + record.completed, 0);
    const upcoming = records.filter(record => record.nextStep);
    const averageProgress = records.length ? Math.round(records.reduce((sum, record) => sum + record.progress, 0) / records.length) : 0;
    const stats = [
      { label: 'Mentorados', value: records.length, caption: `na planilha ${activeSheetName}`, icon: '◎' },
      { label: 'Sessões concluídas', value: completedSessions, caption: 'marcações reconhecidas como concluídas', icon: '✓' },
      { label: 'Marcações e pendências', value: agendaItemsForSheet().length, caption: 'itens encontrados na agenda', icon: '▦' },
      { label: 'Empresas', value: companies.length, caption: 'organizações participantes', icon: '▣' }
    ];
    els.statsGrid.innerHTML = stats.map(item => `<article class="stat-card"><div class="stat-top"><span class="stat-label">${escapeHtml(item.label)}</span><span class="stat-icon">${item.icon}</span></div><div class="stat-value">${item.value}</div><div class="stat-caption">${escapeHtml(item.caption)}</div></article>`).join('');
    els.heroNextCount.textContent = String(upcoming.length);
    els.heroProgress.textContent = `${averageProgress}%`;
    els.heroProgressBar.style.width = `${averageProgress}%`;

    const sortedUpcoming = sortUpcoming(upcoming).slice(0, 7);
    els.upcomingList.innerHTML = sortedUpcoming.length ? sortedUpcoming.map(record => `
      <button class="upcoming-item" data-edit-row="${record.rowIndex}" style="width:100%;background:transparent;text-align:left;">
        <span class="avatar">${initials(record.name)}</span>
        <span><span class="item-title">${escapeHtml(record.name)}</span><span class="item-sub">${escapeHtml(record.company)} • ${escapeHtml(record.nextLabel)}</span></span>
        <span class="item-date">${escapeHtml(record.nextStep)}</span>
      </button>`).join('') : '<div class="empty-state">Nenhum próximo compromisso identificado nesta planilha.</div>';
    bindEditButtons(els.upcomingList);

    const max = Math.max(...companies.map(company => company.count), 1);
    els.companyChart.innerHTML = companies.slice(0, 8).map(company => `<div class="chart-row"><div class="chart-label"><strong>${escapeHtml(company.name)}</strong><span>${company.count}</span></div><div class="chart-track"><div class="chart-fill" style="width:${Math.max(6, Math.round(company.count / max * 100))}%"></div></div></div>`).join('') || '<div class="empty-state">Nenhuma empresa encontrada.</div>';
  }

  function renderMentees() {
    const all = recordsForSheet();
    populateCompanySelect(els.companyFilter, all, true);
    const search = normalized(els.searchInput.value);
    const company = els.companyFilter.value;
    const status = els.statusFilter.value;
    const records = all.filter(record => {
      const matchesSearch = !search || normalized(`${record.name} ${record.email} ${record.company} ${record.phone}`).includes(search);
      return matchesSearch && (!company || record.company === company) && (!status || record.status === status);
    });

    els.menteesTableBody.innerHTML = records.length ? records.map(record => `
      <tr>
        <td><div class="person-cell"><span class="avatar">${initials(record.name)}</span><span class="person-meta"><strong>${escapeHtml(record.name)}</strong><small>${escapeHtml(record.email || record.phone || 'Sem contacto')}</small></span></div></td>
        <td><span class="company-pill">${escapeHtml(record.company)}</span></td>
        <td><div class="progress-wrap"><div class="progress-label"><span>${record.completed}/${record.total}</span><span>${record.progress}%</span></div><div class="progress-track"><div class="progress-fill" style="width:${record.progress}%"></div></div></div></td>
        <td><div class="next-step">${record.nextStep ? `<strong>${escapeHtml(record.nextLabel)}</strong><br>${escapeHtml(record.nextStep)}` : 'Sem data ou pendência'}</div></td>
        <td>${statusBadge(record.status)}</td>
        <td><div class="actions-cell"><button class="small-action" title="Editar" data-edit-row="${record.rowIndex}"><svg><use href="#i-edit"/></svg></button><button class="small-action" title="Concluir a próxima sessão" data-quick-complete="${record.rowIndex}"><svg><use href="#i-check"/></svg></button></div></td>
      </tr>`).join('') : '<tr><td colspan="6"><div class="empty-state">Nenhum mentorado corresponde aos filtros.</div></td></tr>';
    els.tableCount.textContent = `${records.length} de ${all.length} registos`;
    bindEditButtons(els.menteesTableBody);
    els.menteesTableBody.querySelectorAll('[data-quick-complete]').forEach(button => button.addEventListener('click', () => quickComplete(Number(button.dataset.quickComplete))));
  }

  function renderSessionsMatrix() {
    const sheet = currentSheet();
    const layout = ensureLayout(sheet);
    const all = recordsForSheet(sheet);
    populateCompanySelect(els.sessionCompanyFilter, all, true);
    const search = normalized(els.sessionSearch.value);
    const company = els.sessionCompanyFilter.value;
    const status = els.sessionStatusFilter.value;
    const records = all.filter(record => {
      const matchesSearch = !search || normalized(`${record.name} ${record.company} ${record.email}`).includes(search);
      return matchesSearch && (!company || record.company === company) && (!status || record.status === status);
    });

    if (!layout.sessionCols.length) {
      els.sessionMatrix.innerHTML = '<tbody><tr><td><div class="empty-state">Não foram encontradas colunas de sessão nesta planilha.</div></td></tr></tbody>';
      els.matrixCount.textContent = '0 mentorados';
      return;
    }

    const header = `<thead><tr><th class="sticky-name">Mentorado</th><th class="sticky-company">Empresa</th>${layout.sessionLabels.map(label => `<th>${escapeHtml(label)}</th>`).join('')}<th>Progresso</th><th class="matrix-actions">Ação</th></tr></thead>`;
    const body = records.length ? records.map(record => `
      <tr>
        <td class="sticky-name"><div class="matrix-person"><span class="avatar">${initials(record.name)}</span><span><strong>${escapeHtml(record.name)}</strong><small>${escapeHtml(record.email || 'Sem e-mail')}</small></span></div></td>
        <td class="sticky-company"><span class="company-pill">${escapeHtml(record.company)}</span></td>
        ${layout.sessionCols.map((col, index) => {
          const value = getCell(record.row, col);
          const type = classifySession(value);
          return `<td><div class="session-cell-wrap"><input class="session-input ${type}" data-row="${record.rowIndex}" data-col="${col}" data-original="${escapeAttr(value)}" value="${escapeAttr(value)}" aria-label="${escapeAttr(layout.sessionLabels[index] || `Sessão ${index + 1}`)} de ${escapeAttr(record.name)}" placeholder="—" /><button class="quick-ok" data-set-ok-row="${record.rowIndex}" data-set-ok-col="${col}" title="Marcar como concluída">✓</button></div></td>`;
        }).join('')}
        <td><div class="progress-wrap"><div class="progress-label"><span>${record.completed}/${record.total}</span><span>${record.progress}%</span></div><div class="progress-track"><div class="progress-fill" style="width:${record.progress}%"></div></div></div></td>
        <td class="matrix-actions"><button class="small-action" data-edit-row="${record.rowIndex}" title="Abrir registo"><svg><use href="#i-edit"/></svg></button></td>
      </tr>`).join('') : '<tr><td colspan="30"><div class="empty-state">Nenhum mentorado corresponde aos filtros.</div></td></tr>';
    els.sessionMatrix.innerHTML = header + `<tbody>${body}</tbody>`;
    els.matrixCount.textContent = `${records.length} de ${all.length} mentorados`;
    bindEditButtons(els.sessionMatrix);
  }

  function handleSessionInputBlur(event) {
    const input = event.target.closest('.session-input');
    if (!input) return;
    const rowIndex = Number(input.dataset.row);
    const colIndex = Number(input.dataset.col);
    const value = input.value.trim();
    if (value === input.dataset.original) return;
    const sheet = currentSheet();
    const row = sheet.rows[rowIndex];
    if (!row) return;
    setCell(row, colIndex, value);
    input.dataset.original = value;
    input.className = `session-input ${classifySession(value)}`;
    persistData();
    setTimeout(() => renderSessionsMatrix(), 30);
  }

  function handleSessionMatrixClick(event) {
    const button = event.target.closest('[data-set-ok-row]');
    if (!button) return;
    const rowIndex = Number(button.dataset.setOkRow);
    const colIndex = Number(button.dataset.setOkCol);
    const row = currentSheet().rows[rowIndex];
    if (!row) return;
    setCell(row, colIndex, 'ok');
    persistData('Sessão marcada como concluída.');
    renderSessionsMatrix();
  }

  function agendaItemsForSheet(sheet = currentSheet()) {
    if (!sheet) return [];
    const layout = ensureLayout(sheet);
    const records = recordsForSheet(sheet);
    const items = [];
    records.forEach(record => {
      const seen = new Set();
      const pushItem = (source, raw, col) => {
        const value = String(raw ?? '').trim();
        if (!value || isCompleteValue(value)) return;
        const key = `${source}|${value}`;
        if (seen.has(key)) return;
        seen.add(key);
        const date = parseDateValue(value);
        items.push({
          id: `${record.rowIndex}-${col ?? source}-${items.length}`,
          rowIndex: record.rowIndex,
          mentee: record.name,
          company: record.company,
          source,
          value,
          date,
          status: date ? 'scheduled' : 'pending',
          recordStatus: record.status
        });
      };
      if (layout.nextCol !== undefined) pushItem('Próxima data', getCell(record.row, layout.nextCol), layout.nextCol);
      layout.sessionCols.forEach((col, index) => pushItem(layout.sessionLabels[index] || `Sessão ${index + 1}`, getCell(record.row, col), col));
      if (layout.agendaCol !== undefined) pushItem('Agenda', getCell(record.row, layout.agendaCol), layout.agendaCol);
    });
    return items;
  }

  function filteredAgendaItems() {
    const allRecords = recordsForSheet();
    populateCompanySelect(els.agendaCompanyFilter, allRecords, true);
    const search = normalized(els.agendaSearch.value);
    const company = els.agendaCompanyFilter.value;
    return agendaItemsForSheet().filter(item => {
      const matchesSearch = !search || normalized(`${item.mentee} ${item.company} ${item.source} ${item.value}`).includes(search);
      return matchesSearch && (!company || item.company === company);
    });
  }

  function renderAgenda() {
    const items = filteredAgendaItems();
    if (agendaMode === 'calendar') renderCalendar(items);
    else renderAgendaTable(items);
  }

  function setAgendaMode(mode) {
    agendaMode = mode === 'table' ? 'table' : 'calendar';
    document.querySelectorAll('[data-agenda-mode]').forEach(button => button.classList.toggle('active', button.dataset.agendaMode === agendaMode));
    els.agendaCalendarWrap.hidden = agendaMode !== 'calendar';
    els.agendaTableWrap.hidden = agendaMode !== 'table';
    renderAgenda();
  }

  function changeMonth(delta) {
    calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + delta, 1);
    renderAgenda();
  }

  function renderCalendar(items) {
    const year = calendarCursor.getFullYear();
    const month = calendarCursor.getMonth();
    els.calendarMonthLabel.textContent = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(calendarCursor);
    const first = new Date(year, month, 1);
    const start = new Date(year, month, 1 - first.getDay());
    const today = new Date();
    const dayCells = [];
    for (let index = 0; index < 42; index += 1) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
      const sameMonth = date.getMonth() === month;
      const sameToday = sameDate(date, today);
      const events = items.filter(item => item.date && sameDate(item.date, date));
      dayCells.push(`<div class="calendar-day${sameMonth ? '' : ' outside'}${sameToday ? ' today' : ''}"><div class="day-number"><span>${date.getDate()}</span><span>${events.length ? `${events.length} item${events.length > 1 ? 's' : ''}` : ''}</span></div>${events.slice(0, 3).map(item => `<button class="calendar-event" data-edit-row="${item.rowIndex}" title="${escapeAttr(item.value)}"><strong>${escapeHtml(item.mentee)}</strong>${escapeHtml(item.source)}</button>`).join('')}${events.length > 3 ? `<span class="more-events">+ ${events.length - 3} mais</span>` : ''}</div>`);
    }
    els.calendarGrid.innerHTML = dayCells.join('');
    bindEditButtons(els.calendarGrid);

    const undated = items.filter(item => !item.date);
    els.undatedAgenda.innerHTML = undated.length ? undated.slice(0, 18).map(item => `<button class="undated-item" data-edit-row="${item.rowIndex}" style="text-align:left"><strong>${escapeHtml(item.mentee)}</strong><span>${escapeHtml(item.company)} • ${escapeHtml(item.source)}</span><p>${escapeHtml(item.value)}</p></button>`).join('') : '<div class="empty-state" style="grid-column:1/-1">Nenhuma pendência sem data foi encontrada.</div>';
    bindEditButtons(els.undatedAgenda);
  }

  function renderAgendaTable(items) {
    const sorted = [...items].sort((a, b) => {
      if (a.date && b.date) return a.date - b.date;
      if (a.date) return -1;
      if (b.date) return 1;
      return a.mentee.localeCompare(b.mentee, 'pt');
    });
    els.agendaTableBody.innerHTML = sorted.length ? sorted.map(item => `<tr><td><div class="person-cell"><span class="avatar">${initials(item.mentee)}</span><span class="person-meta"><strong>${escapeHtml(item.mentee)}</strong></span></div></td><td><span class="company-pill">${escapeHtml(item.company)}</span></td><td>${escapeHtml(item.source)}</td><td><div class="next-step">${escapeHtml(item.value)}</div></td><td>${item.date ? formatDate(item.date) : '—'}</td><td>${item.status === 'scheduled' ? '<span class="status-badge in-progress">Agendada</span>' : '<span class="status-badge not-started">Pendência</span>'}</td><td><button class="small-action" data-edit-row="${item.rowIndex}" title="Abrir registo"><svg><use href="#i-edit"/></svg></button></td></tr>`).join('') : '<tr><td colspan="7"><div class="empty-state">Nenhuma marcação corresponde aos filtros.</div></td></tr>';
    els.agendaTableCount.textContent = `${sorted.length} marcação${sorted.length === 1 ? '' : 'ões'}`;
    bindEditButtons(els.agendaTableBody);
  }

  function renderCompanies() {
    const groups = groupCompanies(recordsForSheet());
    els.companiesGrid.innerHTML = groups.length ? groups.map(group => `
      <article class="company-card">
        <div class="company-card-head"><div><h3>${escapeHtml(group.name)}</h3><small>${group.count} mentorado${group.count === 1 ? '' : 's'}</small></div><span class="company-logo">${initials(group.name)}</span></div>
        <div class="company-metrics"><div class="metric-mini"><strong>${group.average}%</strong><span>progresso médio</span></div><div class="metric-mini"><strong>${group.completed}</strong><span>concluídos</span></div></div>
        <div class="progress-track"><div class="progress-fill" style="width:${group.average}%"></div></div>
      </article>`).join('') : '<div class="empty-state" style="grid-column:1/-1">Nenhuma empresa encontrada.</div>';
  }

  function renderRawTable() {
    const sheet = currentSheet();
    const rows = sheet.rows || [];
    const maxCols = Math.max(Number(sheet.maxColumns || 0), 1, ...rows.map(row => Array.isArray(row) ? row.length : 0));
    const head = `<thead><tr><th>#</th>${Array.from({ length: maxCols }, (_, index) => `<th>${columnName(index)}</th>`).join('')}</tr></thead>`;
    const body = `<tbody>${rows.map((row, rowIndex) => `<tr><td>${rowIndex + 1}</td>${Array.from({ length: maxCols }, (_, colIndex) => `<td><div class="raw-cell" contenteditable="true" spellcheck="false" data-row="${rowIndex}" data-col="${colIndex}">${escapeHtml(getCell(row, colIndex))}</div></td>`).join('')}</tr>`).join('')}</tbody>`;
    els.rawTable.innerHTML = head + body;
    els.rawTable.querySelectorAll('.raw-cell').forEach(cell => {
      cell.addEventListener('blur', () => {
        const row = Number(cell.dataset.row);
        const col = Number(cell.dataset.col);
        const sheetRow = sheet.rows[row] || (sheet.rows[row] = []);
        setCell(sheetRow, col, cell.textContent.trim());
        persistData();
      });
    });
  }

  function groupCompanies(records) {
    const map = new Map();
    records.forEach(record => {
      const key = record.company || 'Sem empresa';
      if (!map.has(key)) map.set(key, { name: key, records: [] });
      map.get(key).records.push(record);
    });
    return [...map.values()].map(group => ({
      name: group.name,
      count: group.records.length,
      average: group.records.length ? Math.round(group.records.reduce((sum, record) => sum + record.progress, 0) / group.records.length) : 0,
      completed: group.records.filter(record => record.status === 'completed').length
    })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt'));
  }

  function sortUpcoming(records) {
    return [...records].sort((a, b) => parseDateScore(a.nextStep) - parseDateScore(b.nextStep) || a.name.localeCompare(b.name, 'pt'));
  }

  function parseDateScore(value) {
    const date = parseDateValue(value);
    return date ? date.getTime() : Number.MAX_SAFE_INTEGER;
  }

  function parseDateValue(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    const text = String(value ?? '').trim();
    if (!text) return null;
    const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
    if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    const match = text.match(/\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/);
    if (!match) return null;
    let year = match[3] ? Number(match[3]) : inferActiveYear();
    if (year < 100) year += 2000;
    return validDate(year, Number(match[2]), Number(match[1]));
  }

  function validDate(year, month, day) {
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
  }

  function inferActiveYear() {
    const match = String(activeSheetName).match(/20\d{2}/);
    return match ? Number(match[0]) : new Date().getFullYear();
  }

  function sameDate(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function formatDate(date) {
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
  }

  function statusBadge(status) {
    const labels = { completed: 'Concluído', 'in-progress': 'Em andamento', 'not-started': 'Não iniciado' };
    return `<span class="status-badge ${status}">${labels[status] || status}</span>`;
  }

  function populateCompanySelect(select, records, preserve) {
    const companies = [...new Set(records.map(record => record.company))].sort((a, b) => a.localeCompare(b, 'pt'));
    const current = preserve ? select.value : '';
    select.innerHTML = `<option value="">Todas as empresas</option>${companies.map(company => `<option value="${escapeAttr(company)}">${escapeHtml(company)}</option>`).join('')}`;
    select.value = companies.includes(current) ? current : '';
  }

  function bindEditButtons(container) {
    container.querySelectorAll('[data-edit-row]').forEach(button => button.addEventListener('click', () => openMenteeModal(Number(button.dataset.editRow))));
  }

  function openMenteeModal(rowIndex) {
    const sheet = currentSheet();
    const layout = ensureLayout(sheet);
    if (layout.nameCol === undefined) return toast('A planilha selecionada não possui uma coluna de mentorados reconhecida.', 'error');
    const isNew = rowIndex === null || Number.isNaN(rowIndex);
    const row = isNew ? [] : (sheet.rows[rowIndex] || []);
    els.modalTitle.textContent = isNew ? 'Adicionar mentorado' : 'Editar mentorado';
    els.editRowIndex.value = isNew ? '' : String(rowIndex);
    els.formName.value = getCell(row, layout.nameCol);
    els.formCompany.value = getCell(row, layout.companyCol);
    els.formEmail.value = getCell(row, layout.emailCol);
    els.formPhone.value = getCell(row, layout.phoneCol);
    els.formPrevious.value = getCell(row, layout.previousCol);
    els.formNext.value = getCell(row, layout.nextCol);
    els.formObservation.value = getCell(row, layout.observationCol);
    els.formPartial.value = getCell(row, layout.partialCol);
    els.formAgenda.value = getCell(row, layout.agendaCol);
    els.formClosure.value = getCell(row, layout.closureCol);
    els.formReport.value = getCell(row, layout.reportCol);

    toggleField(els.previousField, layout.previousCol !== undefined);
    toggleField(els.nextField, layout.nextCol !== undefined);
    toggleField(els.observationField, layout.observationCol !== undefined);
    toggleField(els.partialField, layout.partialCol !== undefined);
    toggleField(els.agendaField, layout.agendaCol !== undefined);

    els.sessionFields.innerHTML = layout.sessionCols.length ? layout.sessionCols.map((col, index) => `<label>${escapeHtml(layout.sessionLabels[index] || `Sessão ${index + 1}`)}<input data-session-col="${col}" value="${escapeAttr(getCell(row, col))}" placeholder="ok, data ou observação" /></label>`).join('') : '<div class="empty-state" style="grid-column:1/-1">Esta planilha não possui colunas de sessão reconhecidas.</div>';
    els.deleteBtn.style.visibility = isNew ? 'hidden' : 'visible';
    setFormTab('basic');
    els.modalBackdrop.hidden = false;
    setTimeout(() => els.formName.focus(), 30);
  }

  function closeMenteeModal() {
    els.modalBackdrop.hidden = true;
    els.menteeForm.reset();
  }

  function setFormTab(tab) {
    document.querySelectorAll('[data-form-tab]').forEach(button => button.classList.toggle('active', button.dataset.formTab === tab));
    document.querySelectorAll('[data-form-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.formPanel === tab));
  }

  function toggleField(element, visible) {
    element.style.display = visible ? '' : 'none';
  }

  function saveMenteeFromForm(event) {
    event.preventDefault();
    const sheet = currentSheet();
    const layout = ensureLayout(sheet);
    let rowIndex = els.editRowIndex.value === '' ? null : Number(els.editRowIndex.value);
    let row;
    if (rowIndex === null) {
      rowIndex = sheet.rows.length;
      row = [];
      const ids = recordsForSheet(sheet).map(record => Number(record.id)).filter(Number.isFinite);
      setCell(row, layout.idCol, Math.max(0, ...ids) + 1);
      if (layout.groupCol !== undefined) setCell(row, layout.groupCol, els.formCompany.value.trim());
      sheet.rows.push(row);
    } else {
      row = sheet.rows[rowIndex] || (sheet.rows[rowIndex] = []);
    }

    setCell(row, layout.nameCol, els.formName.value.trim());
    setCell(row, layout.companyCol, els.formCompany.value.trim());
    setCell(row, layout.emailCol, els.formEmail.value.trim());
    setCell(row, layout.phoneCol, els.formPhone.value.trim());
    setCell(row, layout.previousCol, els.formPrevious.value.trim());
    setCell(row, layout.nextCol, els.formNext.value.trim());
    setCell(row, layout.observationCol, els.formObservation.value.trim());
    setCell(row, layout.partialCol, els.formPartial.value.trim());
    setCell(row, layout.agendaCol, els.formAgenda.value.trim());
    setCell(row, layout.closureCol, els.formClosure.value.trim());
    setCell(row, layout.reportCol, els.formReport.value.trim());
    els.sessionFields.querySelectorAll('[data-session-col]').forEach(input => setCell(row, Number(input.dataset.sessionCol), input.value.trim()));

    persistData('Registo guardado com sucesso.');
    closeMenteeModal();
    renderCurrentView();
  }

  function deleteCurrentMentee() {
    const rowIndex = Number(els.editRowIndex.value);
    if (!Number.isFinite(rowIndex)) return;
    const name = els.formName.value || 'este registo';
    if (!confirm(`Excluir ${name}? Esta ação poderá ser revertida apenas restaurando um backup.`)) return;
    currentSheet().rows.splice(rowIndex, 1);
    persistData('Registo excluído.');
    closeMenteeModal();
    renderCurrentView();
  }

  function quickComplete(rowIndex) {
    const sheet = currentSheet();
    const layout = ensureLayout(sheet);
    const row = sheet.rows[rowIndex];
    if (!row) return;
    const pendingCol = layout.sessionCols.find(col => !isCompleteValue(getCell(row, col)));
    if (pendingCol === undefined) return toast('Todas as sessões já estão marcadas como concluídas.');
    setCell(row, pendingCol, 'ok');
    persistData('Sessão marcada como concluída.');
    renderCurrentView();
  }

  function addRawRow() {
    const sheet = currentSheet();
    const maxCols = Math.max(Number(sheet.maxColumns || 0), 1, ...sheet.rows.map(row => row.length));
    sheet.rows.push(Array(maxCols).fill(null));
    persistData('Nova linha adicionada.');
    renderRawTable();
  }

  function addRawColumn() {
    const sheet = currentSheet();
    const maxCols = Math.max(Number(sheet.maxColumns || 0), 1, ...sheet.rows.map(row => row.length));
    sheet.rows.forEach(row => { while (row.length <= maxCols) row.push(null); });
    sheet.maxColumns = maxCols + 1;
    persistData('Nova coluna adicionada.');
    renderRawTable();
  }

  async function importExcel(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      toast('A importar o Excel...');
      const imported = await window.AuraExcel.readXlsx(file);
      if (!imported.sheets.length) throw new Error('Nenhuma planilha foi encontrada.');
      workbook = imported;
      activeSheetName = imported.sheets.find(sheet => sheet.name === '2026')?.name || imported.sheets[0].name;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(workbook));
      renderSheetPicker();
      updateSourceLabels();
      renderCurrentView();
      toast('Excel importado com sucesso.', 'success');
    } catch (error) {
      console.error(error);
      toast(`Falha ao importar: ${error.message}`, 'error');
    }
  }

  function openExportModal() {
    els.exportBackdrop.hidden = false;
  }

  function closeExportModal() {
    els.exportBackdrop.hidden = true;
  }

  async function exportExcel(mode) {
    if (exportBusy) return;
    exportBusy = true;
    closeExportModal();
    try {
      toast('A preparar o Excel...');
      const date = new Date().toISOString().slice(0, 10);
      if (mode === 'raw') {
        await window.AuraExcel.writeRawXlsx(workbook, `AuraEX-Base-${date}.xlsx`);
      } else {
        await window.AuraExcel.writeBeautifulXlsx(workbook, `AuraEX-Relatorio-Mentorias-${date}.xlsx`, activeSheetName);
      }
      toast('Excel exportado com sucesso.', 'success');
    } catch (error) {
      console.error(error);
      toast(`Falha ao exportar: ${error.message}`, 'error');
    } finally {
      exportBusy = false;
    }
  }

  function downloadBackup() {
    const blob = new Blob([JSON.stringify(workbook, null, 2)], { type: 'application/json' });
    window.AuraExcel.downloadBlob(blob, `AuraEX-Backup-${new Date().toISOString().slice(0, 10)}.json`);
    toast('Backup descarregado.', 'success');
  }

  async function restoreBackup(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed.sheets)) throw new Error('Backup inválido.');
      workbook = parsed;
      activeSheetName = workbook.sheets.find(sheet => sheet.name === '2026')?.name || workbook.sheets[0]?.name || '';
      localStorage.setItem(STORAGE_KEY, JSON.stringify(workbook));
      renderSheetPicker();
      updateSourceLabels();
      renderCurrentView();
      toast('Backup restaurado.', 'success');
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function resetData() {
    if (!confirm('Restaurar os dados originais? Todas as alterações locais serão apagadas.')) return;
    workbook = deepClone(window.AURA_INITIAL_DATA);
    activeSheetName = workbook.sheets.find(sheet => sheet.name === '2026')?.name || workbook.sheets[0]?.name || '';
    localStorage.removeItem(STORAGE_KEY);
    renderSheetPicker();
    updateSourceLabels();
    renderCurrentView();
    toast('Dados iniciais restaurados.', 'success');
  }

  function hydrateSettings() {
    els.apiUrl.value = settings.apiUrl || '';
    els.apiToken.value = settings.apiToken || '';
    els.autoSync.checked = Boolean(settings.autoSync);
    els.mcpEndpoint.value = `${location.origin}/mcp`;
  }

  function saveSettings() {
    settings = { apiUrl: els.apiUrl.value.trim(), autoSync: els.autoSync.checked, apiToken: els.apiToken.value.trim() };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ apiUrl: settings.apiUrl, autoSync: settings.autoSync }));
    if (settings.apiToken) sessionStorage.setItem(API_TOKEN_KEY, settings.apiToken); else sessionStorage.removeItem(API_TOKEN_KEY);
    toast('Configurações guardadas.', 'success');
  }

  async function syncNow() {
    const url = els.apiUrl.value.trim();
    if (!url) return toast('Informe primeiro a URL da API.', 'error');
    settings.apiUrl = url;
    try {
      const response = await apiFetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
      if (response.ok) {
        const remote = await response.json();
        if (Array.isArray(remote.sheets)) {
          workbook = { ...workbook, ...remote };
          activeSheetName = workbook.sheets.find(sheet => sheet.name === activeSheetName)?.name || workbook.sheets[0]?.name || '';
          localStorage.setItem(STORAGE_KEY, JSON.stringify(workbook));
          renderSheetPicker();
          renderCurrentView();
          toast('Dados recebidos da API.', 'success');
          return;
        }
      }
      await postToApi();
      toast('Dados enviados para a API.', 'success');
    } catch (error) {
      toast(`Falha na sincronização: ${error.message}`, 'error');
    }
  }

  async function postToApi() {
    const response = await apiFetch(settings.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(workbook)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response;
  }

  async function loadAuthSession() {
    try {
      const response = await fetch('/api/auth/session', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      const data = await response.json();
      if (!response.ok || !data.authenticated) {
        location.replace('/login.html');
        return false;
      }
      authSession = data;
      return true;
    } catch {
      location.replace('/login.html');
      return false;
    }
  }

  function hydrateAuthenticatedUser() {
    const user = authSession?.user || {};
    const name = user.name || user.email || 'Utilizador';
    const role = user.role === 'admin' ? 'Administrador' : (user.role || 'Utilizador');
    const av = initials(name);
    if (els.currentUserName) els.currentUserName.textContent = name;
    if (els.currentUserRole) els.currentUserRole.textContent = role;
    if (els.userAvatar) els.userAvatar.textContent = av;
    if (els.sidebarUserName) els.sidebarUserName.textContent = name;
    if (els.sidebarUserRole) els.sidebarUserRole.textContent = role;
    if (els.sidebarUserAvatar) els.sidebarUserAvatar.textContent = av;
  }

  async function apiFetch(url, options = {}) {
    const target = new URL(url, location.href);
    const sameOrigin = target.origin === location.origin;
    const headers = new Headers(options.headers || {});
    const method = String(options.method || 'GET').toUpperCase();
    if (sameOrigin && !['GET', 'HEAD', 'OPTIONS'].includes(method) && authSession?.csrfToken) headers.set('X-CSRF-Token', authSession.csrfToken);
    if (!sameOrigin && settings.apiToken) headers.set('Authorization', `Bearer ${settings.apiToken}`);
    return fetch(target.href, { ...options, headers, credentials: sameOrigin ? 'same-origin' : 'omit' });
  }

  async function logout() {
    if (!confirm('Deseja terminar a sessão?')) return;
    try {
      await apiFetch('/api/auth/logout', { method: 'POST', headers: { Accept: 'application/json' } });
    } finally {
      sessionStorage.removeItem(API_TOKEN_KEY);
      location.replace('/login.html');
    }
  }

  async function loadTokens() {
    if (!els.tokenList || authSession?.user?.role !== 'admin') {
      if (els.tokenList) els.tokenList.innerHTML = '<div class="empty-state">Apenas administradores podem gerir tokens.</div>';
      return;
    }
    try {
      const response = await apiFetch('/api/tokens', { headers: { Accept: 'application/json' } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      renderTokens(data.tokens || []);
    } catch (error) {
      els.tokenList.innerHTML = `<div class="empty-state">Falha ao carregar tokens: ${escapeHtml(error.message)}</div>`;
    }
  }

  function renderTokens(tokens) {
    if (!tokens.length) {
      els.tokenList.innerHTML = '<div class="empty-state">Nenhum token criado.</div>';
      return;
    }
    els.tokenList.innerHTML = tokens.map(token => {
      const revoked = Boolean(token.revokedAt);
      const status = revoked ? 'Revogado' : (token.expiresAt && new Date(token.expiresAt) < new Date() ? 'Expirado' : 'Ativo');
      return `<div class="token-row ${revoked ? 'revoked' : ''}">
        <div><strong>${escapeHtml(token.name)}</strong><small>${escapeHtml(status)} • criado em ${formatDateTime(token.createdAt)}</small></div>
        <code class="token-prefix">${escapeHtml(token.prefix)}…</code>
        <div class="token-scopes">${(token.scopes || []).map(scope => `<i>${escapeHtml(scope)}</i>`).join('')}</div>
        <div><strong>Expira</strong><small>${formatDateTime(token.expiresAt)}</small></div>
        ${revoked ? '<span class="status-badge not-started">Revogado</span>' : `<button class="btn btn-danger" data-revoke-token="${escapeAttr(token.id)}">Revogar</button>`}
      </div>`;
    }).join('');
  }

  async function createPersonalToken() {
    const name = els.tokenName.value.trim() || 'Agente AuraEX';
    const scopes = ['auraex:read'];
    if (els.tokenWriteScope.checked) scopes.push('auraex:write');
    els.createTokenBtn.disabled = true;
    try {
      const response = await apiFetch('/api/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ name, scopes, expiresInDays: Number(els.tokenExpiry.value) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      els.newTokenValue.textContent = data.token;
      els.newTokenPanel.hidden = false;
      await loadTokens();
      toast('Token pessoal gerado. Copie-o agora.', 'success');
    } catch (error) {
      toast(`Não foi possível gerar o token: ${error.message}`, 'error');
    } finally {
      els.createTokenBtn.disabled = false;
    }
  }

  async function revokePersonalToken(tokenId) {
    if (!confirm('Revogar este token? O agente deixará de conseguir acessar imediatamente.')) return;
    try {
      const response = await apiFetch(`/api/tokens/${encodeURIComponent(tokenId)}`, { method: 'DELETE', headers: { Accept: 'application/json' } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      await loadTokens();
      toast('Token revogado.', 'success');
    } catch (error) {
      toast(`Falha ao revogar: ${error.message}`, 'error');
    }
  }

  async function changeAccountPassword(event) {
    event.preventDefault();
    const currentPassword = els.currentPassword.value;
    const newPassword = els.newPassword.value;
    if (newPassword.length < 12) return toast('A nova senha precisa ter pelo menos 12 caracteres.', 'error');
    if (newPassword !== els.confirmPassword.value) return toast('A confirmação da nova senha não coincide.', 'error');
    els.changePasswordBtn.disabled = true;
    try {
      const response = await apiFetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      alert('Senha alterada. Entre novamente com a nova senha.');
      location.replace('/login.html');
    } catch (error) {
      toast(`Não foi possível alterar a senha: ${error.message}`, 'error');
    } finally {
      els.changePasswordBtn.disabled = false;
    }
  }

  async function copyText(text, successMessage) {
    try {
      await navigator.clipboard.writeText(String(text || ''));
      toast(successMessage, 'success');
    } catch {
      const area = document.createElement('textarea');
      area.value = String(text || '');
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
      toast(successMessage, 'success');
    }
  }

  function formatDateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  function openOnboarding(force = false) {
    if (!force && localStorage.getItem(ONBOARDING_KEY) === 'true') return;
    onboardingStep = 0;
    els.dontShowOnboarding.checked = false;
    renderOnboarding();
    els.onboardingBackdrop.hidden = false;
  }

  function closeOnboarding() {
    if (els.dontShowOnboarding.checked) localStorage.setItem(ONBOARDING_KEY, 'true');
    els.onboardingBackdrop.hidden = true;
  }

  function advanceOnboarding() {
    if (onboardingStep < ONBOARDING_SLIDES.length - 1) {
      onboardingStep += 1;
      renderOnboarding();
      return;
    }
    localStorage.setItem(ONBOARDING_KEY, 'true');
    els.onboardingBackdrop.hidden = true;
    toast('Tudo pronto. Bem-vindo ao AuraEX!', 'success');
  }

  function renderOnboarding() {
    const slide = ONBOARDING_SLIDES[onboardingStep];
    els.onboardingProgress.innerHTML = ONBOARDING_SLIDES.map((_, index) => `<i class="${index <= onboardingStep ? 'active' : ''}"></i>`).join('');
    els.onboardingContent.innerHTML = `<div class="onboarding-slide"><div><p class="panel-kicker">PASSO ${onboardingStep + 1} DE ${ONBOARDING_SLIDES.length}</p><h2 id="onboardingTitle">${escapeHtml(slide.title)}</h2><p>${escapeHtml(slide.text)}</p><div class="onboarding-list">${slide.points.map((point, index) => `<div><b>${index + 1}</b><span>${escapeHtml(point)}</span></div>`).join('')}</div></div><div class="onboarding-art">${slide.art}</div></div>`;
    els.onboardingPrev.disabled = onboardingStep === 0;
    els.onboardingPrev.style.visibility = onboardingStep === 0 ? 'hidden' : 'visible';
    els.onboardingNext.textContent = onboardingStep === ONBOARDING_SLIDES.length - 1 ? 'Começar a usar' : 'Continuar';
  }

  function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
  }

  function columnName(index) {
    let n = index + 1;
    let name = '';
    while (n > 0) {
      const rem = (n - 1) % 26;
      name = String.fromCharCode(65 + rem) + name;
      n = Math.floor((n - 1) / 26);
    }
    return name;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#096;');
  }

  function toast(message, type = '') {
    const node = document.createElement('div');
    node.className = `toast ${type}`.trim();
    node.textContent = message;
    els.toastContainer.appendChild(node);
    setTimeout(() => node.remove(), 3400);
  }
})();
