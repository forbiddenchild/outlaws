let positions = [];
let positionLabelMap = {};
let loggedInUser = null;
let adminSession = null;
let voterNames = [];
let activeOptionIndex = -1;
let voteTimerInterval = null;

function setPositions(positionList) {
  positions = Array.isArray(positionList) ? positionList : [];
  positionLabelMap = positions.reduce((map, position) => {
    map[position.key] = position.label;
    return map;
  }, {});
}

function getPositionLabel(key) {
  return positionLabelMap[key] || String(key).replace(/_/g, ' ');
}

function fetchPositions() {
  return fetch('/api/positions')
    .then((response) => response.json())
    .then((data) => {
      if (!Array.isArray(data)) {
        throw new Error('Invalid positions data');
      }
      setPositions(data);
      return data;
    });
}

function renderVoteFields() {
  const voteGrid = document.querySelector('.vote-grid');
  if (!voteGrid) {
    return;
  }

  voteGrid.innerHTML = positions.length
    ? positions
        .map((position) => `
          <label class="vote-field">${position.label}
            <select id="${position.key}" class="vote-select">
              <option value="">Select</option>
            </select>
          </label>
        `)
        .join('')
    : '<p>No positions are configured yet. Add positions from the admin portal.</p>';
}

function populatePositionSelects() {
  const positionSelect = document.getElementById('contestantPosition');
  if (!positionSelect) {
    return;
  }

  positionSelect.innerHTML = '<option value="">Select position</option>' +
    positions.map((position) => `<option value="${position.key}">${position.label}</option>`).join('');
}

function getStoredUser() {
  try {
    const stored = localStorage.getItem('outlawsVoter');
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    return null;
  }
}

function setStoredUser(user) {
  localStorage.setItem('outlawsVoter', JSON.stringify(user));
}

function clearStoredUser() {
  localStorage.removeItem('outlawsVoter');
}

function getStoredVoters() {
  try {
    const stored = localStorage.getItem('outlawsVoters');
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    return [];
  }
}

function setStoredVoters(voters) {
  localStorage.setItem('outlawsVoters', JSON.stringify(Array.isArray(voters) ? voters : []));
}

function clearStoredVoters() {
  localStorage.removeItem('outlawsVoters');
}

function setStoredAdmin(user) {
  localStorage.setItem('outlawsAdmin', JSON.stringify(user));
}

function clearStoredAdmin() {
  localStorage.removeItem('outlawsAdmin');
}

function getStoredAdmin() {
  try {
    const stored = localStorage.getItem('outlawsAdmin');
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    return null;
  }
}

function refreshNavUser() {
  const navUserName = document.getElementById('navUserName');
  const stored = getStoredUser();
  if (stored) {
    loggedInUser = stored;
    navUserName.textContent = stored.fullName;
    navUserName.classList.remove('hidden');
  } else {
    loggedInUser = null;
    navUserName.classList.add('hidden');
  }
}

function applyLoginState() {
  const loginForm = document.getElementById('navLoginForm');
  const logoutButton = document.getElementById('logoutButton');
  if (!loginForm || !logoutButton) {
    return;
  }

  if (loggedInUser) {
    loginForm.classList.add('hidden');
    logoutButton.classList.remove('hidden');
  } else {
    loginForm.classList.remove('hidden');
    logoutButton.classList.add('hidden');
  }
}

function applyAdminState() {
  const adminLoginCard = document.getElementById('adminLoginCard');
  const adminSettingsCard = document.getElementById('adminSettingsCard');
  const adminContestantCard = document.getElementById('adminContestantCard');
  const adminPositionCard = document.getElementById('adminPositionCard');
  const adminContestantListCard = document.getElementById('adminContestantListCard');
  const adminVoterCard = document.getElementById('adminVoterCard');
  const adminResultsCard = document.getElementById('adminResultsCard');
  const navUserName = document.getElementById('navUserName');
  const logoutButton = document.getElementById('logoutButton');

  if (adminSession) {
    if (adminLoginCard) adminLoginCard.classList.add('hidden');
    if (adminSettingsCard) adminSettingsCard.classList.remove('hidden');
    if (adminContestantCard) adminContestantCard.classList.remove('hidden');
    if (adminPositionCard) adminPositionCard.classList.remove('hidden');
    if (adminContestantListCard) adminContestantListCard.classList.remove('hidden');
    if (adminVoterCard) adminVoterCard.classList.remove('hidden');
    if (adminResultsCard) adminResultsCard.classList.remove('hidden');
    if (navUserName) {
      navUserName.textContent = 'Admin';
      navUserName.classList.remove('hidden');
    }
    if (logoutButton) logoutButton.classList.remove('hidden');
  } else {
    if (adminLoginCard) adminLoginCard.classList.remove('hidden');
    if (adminSettingsCard) adminSettingsCard.classList.add('hidden');
    if (adminContestantCard) adminContestantCard.classList.add('hidden');
    if (adminPositionCard) adminPositionCard.classList.add('hidden');
    if (adminContestantListCard) adminContestantListCard.classList.add('hidden');
    if (adminVoterCard) adminVoterCard.classList.add('hidden');
    if (adminResultsCard) adminResultsCard.classList.add('hidden');
    if (navUserName) navUserName.classList.add('hidden');
    if (logoutButton) logoutButton.classList.add('hidden');
  }
}

function normalizeVoterItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map((item) => {
    if (typeof item === 'string') {
      return { fullName: item, hasVoted: false };
    }

    return {
      fullName: String(item.fullName || item.full_name || '').trim(),
      hasVoted: Boolean(item.hasVoted || item.has_voted),
    };
  }).filter((item) => item.fullName);
}

function renderVoterDropdown(names) {
  const select = document.getElementById('navFullName');
  if (!select) {
    return;
  }

  const voters = normalizeVoterItems(names);
  select.innerHTML = '<option value="">Select your name</option>';
  voters.forEach((voter) => {
    const option = document.createElement('option');
    option.value = voter.fullName;
    option.textContent = voter.hasVoted
      ? `${voter.fullName} (already voted)`
      : voter.fullName;
    option.disabled = voter.hasVoted;
    option.dataset.hasVoted = voter.hasVoted;
    select.appendChild(option);
  });
}

function loadVoterNames() {
  const cachedNames = getStoredVoters();
  if (Array.isArray(cachedNames) && cachedNames.length) {
    voterNames = normalizeVoterItems(cachedNames);
    renderVoterDropdown(voterNames);
  }

  fetch('/api/voters')
    .then((response) => response.json())
    .then((data) => {
      voterNames = normalizeVoterItems(data);
      setStoredVoters(voterNames);
      renderVoterDropdown(voterNames);
    })
    .catch(() => {
      voterNames = normalizeVoterItems(cachedNames);
      renderVoterDropdown(voterNames);
      console.warn('Could not load voter names, using cached list.');
    });
}

function getLoginFullName() {
  const select = document.getElementById('navFullName');
  return select ? select.value.trim() : '';
}

function login(event) {
  event.preventDefault();
  const fullName = getLoginFullName();
  const password = document.getElementById('navPassword').value.trim();

  if (!fullName) {
    window.alert('Please select your name from the list.');
    return;
  }

  fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullName, password })
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.error) {
        window.alert(data.error);
        return;
      }

      loggedInUser = { password, fullName: data.fullName, hasVoted: data.hasVoted };
      setStoredUser(loggedInUser);
      refreshNavUser();
      applyLoginState();

      const voteMessage = document.getElementById('voteMessage');
      if (voteMessage) {
        voteMessage.textContent = 'Login successful. Redirecting to the voting page...';
      }

      window.location.href = '/vote.html';
    })
    .catch(() => {
      window.alert('Login failed.');
    });
}

function loadAdminContestants() {
  const storedAdmin = getStoredAdmin();
  if (!storedAdmin) {
    return;
  }

  const query = new URLSearchParams({
    username: storedAdmin.fullName,
    password: storedAdmin.password
  });

  fetch(`/api/admin/contestants?${query.toString()}`)
    .then((response) => response.json())
    .then((data) => {
      renderAdminContestantList(data);
    })
    .catch(() => {
      const list = document.getElementById('contestantList');
      if (list) {
        list.innerHTML = '<p>Unable to load contestants.</p>';
      }
    });
}

function loadAdminPositions() {
  const storedAdmin = getStoredAdmin();
  if (!storedAdmin) {
    return;
  }

  fetchPositions()
    .then(() => {
      renderAdminPositionList();
      populatePositionSelects();
      renderVoteFields();
      populateFields();
    })
    .catch(() => {
      const container = document.getElementById('positionListContainer');
      if (container) {
        container.innerHTML = '<p>Unable to load positions.</p>';
      }
    });
}

function renderAdminPositionList() {
  const container = document.getElementById('positionListContainer');
  if (!container) {
    return;
  }

  if (!positions.length) {
    container.innerHTML = '<p>No positions configured yet.</p>';
    return;
  }

  container.innerHTML = `
    <div class="position-list-header">
      <h3>Configured Positions</h3>
      <p>Delete a position to remove its contestants and vote data.</p>
    </div>
    <div class="position-list-grid">
      ${positions.map((position) => `
        <div class="position-card">
          <div>
            <strong>${position.label}</strong>
            <span>${position.key}</span>
          </div>
          <button type="button" data-position="${position.key}">Delete</button>
        </div>
      `).join('')}
    </div>
  `;

  container.querySelectorAll('button[data-position]').forEach((button) => {
    button.addEventListener('click', (event) => {
      const positionKey = event.currentTarget.getAttribute('data-position');
      if (!positionKey) return;
      if (!window.confirm('Delete this position and all associated contestants and vote data?')) {
        return;
      }

      const storedAdmin = getStoredAdmin();
      if (!storedAdmin) {
        window.alert('Please log in as admin first.');
        return;
      }

      const params = new URLSearchParams({ username: storedAdmin.fullName, password: storedAdmin.password });
      fetch(`/api/admin/positions/${encodeURIComponent(positionKey)}?${params.toString()}`, {
        method: 'DELETE'
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.error) {
            window.alert(data.error);
            return;
          }
          loadAdminPositions();
          loadAdminContestants();
          populateFields();
        })
        .catch(() => {
          window.alert('Unable to delete position.');
        });
    });
  });
}

function renderAdminContestantList(contestants) {
  const list = document.getElementById('contestantList');
  if (!list) {
    return;
  }

  if (!Array.isArray(contestants) || !contestants.length) {
    list.innerHTML = '<p>No registered contestants yet.</p>';
    return;
  }

  list.innerHTML = contestants
    .map((contestant) => `
      <div class="contestant-row">
        <div>
          <strong>${contestant.name}</strong>
          <span>${contestant.position.replace(/_/g, ' ')}</span>
        </div>
        <button type="button" data-id="${contestant.id}">Remove</button>
      </div>
    `)
    .join('');

  list.querySelectorAll('button[data-id]').forEach((button) => {
    button.addEventListener('click', (event) => {
      const id = event.currentTarget.getAttribute('data-id');
      if (!id) return;
      const storedAdmin = getStoredAdmin();
      if (!storedAdmin) {
        window.alert('Please log in as admin first.');
        return;
      }

      if (!window.confirm('Remove this contestant and all details?')) {
        return;
      }

      const query = new URLSearchParams({
        username: storedAdmin.fullName,
        password: storedAdmin.password
      });

      fetch(`/api/admin/contestants/${id}?${query.toString()}`, {
        method: 'DELETE'
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.error) {
            window.alert(data.error);
            return;
          }
          loadAdminContestants();
          populateFields();
        })
        .catch(() => {
          window.alert('Unable to remove contestant at this time.');
        });
    });
  });
}

function populateFields() {
  fetch('/api/contestants')
    .then((response) => response.json())
    .then((data) => {
      positions.forEach((position) => {
        const select = document.getElementById(position.key);
        if (!select) {
          return;
        }

        select.innerHTML = '<option value="">Select</option>';
        const items = data[position.key] || [];
        items.forEach((contestant) => {
          const option = document.createElement('option');
          option.value = contestant.name;
          option.textContent = contestant.name;
          select.appendChild(option);
        });
      });

      renderHomeContestants(data);
    })
    .catch(() => {
      positions.forEach((position) => {
        const select = document.getElementById(position.key);
        if (!select) {
          return;
        }

        select.innerHTML = '<option value="">Select</option>';
      });

      renderHomeContestants({});
    });
}

function renderHomeContestants(data) {
  const container = document.getElementById('contestantSections');
  if (!container) {
    return;
  }

  if (!positions.length) {
    container.innerHTML = '<p>No positions are configured yet. Ask an administrator to add positions.</p>';
    return;
  }

  const sections = positions.map((position) => {
    const contestants = (data[position.key] || []).map((contestant) => ({
      name: contestant.name,
      photoPath: contestant.photoPath || '/images/SaveClip.App_475291800_18038161979590096_2106789025414944852_n.webp'
    }));

    const cards = contestants.length
      ? contestants
          .map((contestant) => `
            <article class="candidate-card">
              <img src="${contestant.photoPath}" alt="${contestant.name} for ${position.label}" />
              <h3>${contestant.name}</h3>
            </article>
          `)
          .join('')
      : `<article class="candidate-card empty-card"><div class="empty-card-body"><p>No contestants registered yet.</p><strong>${position.label}</strong></div></article>`;

    return `
      <section class="position-section">
        <h2>${position.label}</h2>
        <div class="candidate-grid">
          ${cards}
        </div>
      </section>
    `;
  });

  container.innerHTML = sections.join('');
}

function lockVoteForm() {
  Array.from(document.querySelectorAll('#voteForm select')).forEach((select) => {
    select.disabled = true;
  });
  const submitButton = document.querySelector('#voteForm button');
  if (submitButton) {
    submitButton.disabled = true;
  }
}

function submitVote(event) {
  event.preventDefault();

  if (!loggedInUser) {
    document.getElementById('voteMessage').textContent = 'Please log in first.';
    return;
  }

  const selections = {};
  positions.forEach((position) => {
    const select = document.getElementById(position.key);
    selections[position.key] = select ? select.value : '';
  });

  fetch('/api/vote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullName: loggedInUser.fullName, password: loggedInUser.password, selections })
  })
    .then((response) => response.json())
    .then((data) => {
      document.getElementById('voteMessage').textContent = data.message || data.error;
      if (data.message) {
        loggedInUser.hasVoted = true;
        setStoredUser(loggedInUser);
        lockVoteForm();
      }
      loadResults();
    })
    .catch(() => {
      document.getElementById('voteMessage').textContent = 'Vote submission failed.';
    });
}

function formatRemainingTime(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours || days) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
}

function updateVoteTimer(endTime) {
  const timerEl = document.getElementById('voteTimer');
  if (!timerEl) {
    return;
  }

  const now = new Date();
  const end = new Date(endTime);
  const diff = end.getTime() - now.getTime();

  if (diff <= 0) {
    timerEl.textContent = 'Voting has closed.';
    if (voteTimerInterval) {
      clearInterval(voteTimerInterval);
      voteTimerInterval = null;
    }
    const voteForm = document.getElementById('voteForm');
    if (voteForm) {
      voteForm.querySelectorAll('select, button').forEach((control) => {
        control.disabled = true;
      });
    }
    return;
  }

  timerEl.textContent = `Time remaining: ${formatRemainingTime(diff)}`;
}

function startVoteTimer(endTime) {
  if (voteTimerInterval) {
    clearInterval(voteTimerInterval);
  }

  updateVoteTimer(endTime);
  voteTimerInterval = setInterval(() => updateVoteTimer(endTime), 1000);
}

function toDateTimeLocalValue(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function loadElectionTimer() {
  const timerEl = document.getElementById('voteTimer');
  if (!timerEl) {
    return;
  }

  fetch('/api/admin/status')
    .then((response) => response.json())
    .then((status) => {
      if (status && status.endTime) {
        startVoteTimer(status.endTime);
      } else {
        timerEl.textContent = 'Election end time is not available.';
      }
    })
    .catch(() => {
      timerEl.textContent = 'Unable to load election timer.';
    });
}

function loadResults() {
  const resultBox = document.getElementById('results');
  if (!resultBox) {
    return;
  }

  fetch('/api/results')
    .then((response) => response.json())
    .then((data) => {
      resultBox.innerHTML = '';

      if (!data.isOpen) {
        const closedMsg = document.createElement('p');
        closedMsg.textContent = 'Voting is now closed. Public results are hidden; only admins can view compiled results.';
        resultBox.appendChild(closedMsg);
        return;
      }

      const openMsg = document.createElement('p');
      openMsg.textContent = 'Election is open. Public results remain hidden until voting closes.';
      resultBox.appendChild(openMsg);
    })
    .catch(() => {
      resultBox.textContent = 'Unable to load results.';
    });
}

function renderChartCard(position, rows) {
  const container = document.getElementById('adminChartArea');
  if (!container) return;

  const card = document.createElement('div');
  card.className = 'chart-card';
  card.innerHTML = `<h3>${getPositionLabel(position)}</h3>`;

  if (!rows.length) {
    card.innerHTML += '<p>No votes yet.</p>';
    container.appendChild(card);
    return;
  }

  const totalVotes = rows.reduce((sum, row) => sum + row.count, 0);
  const canvas = document.createElement('canvas');
  canvas.width = 580;
  canvas.height = 360;
  card.appendChild(canvas);
  container.appendChild(card);

  const context = canvas.getContext('2d');
  const barWidth = 52;
  const gap = 24;
  const chartHeight = 220;
  const startX = 28;
  const startY = 270;
  const colors = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6'];

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#f8fafc';
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.strokeStyle = '#cbd5e1';
  context.lineWidth = 1;
  for (let line = 0; line <= 4; line += 1) {
    const y = startY - (chartHeight / 4) * line;
    context.beginPath();
    context.moveTo(startX - 10, y);
    context.lineTo(canvas.width - 20, y);
    context.stroke();
  }

  context.fillStyle = '#0f172a';
  context.font = '14px Arial';
  context.textBaseline = 'bottom';
  context.fillText(`Total votes: ${totalVotes}`, startX, 20);

  rows.forEach((row, index) => {
    const percent = totalVotes ? (row.count / totalVotes) * 100 : 0;
    const height = Math.max((percent / 100) * chartHeight, 10);
    const x = startX + index * (barWidth + gap);
    const y = startY - height;
    const color = colors[index % colors.length];

    const gradient = context.createLinearGradient(x, y, x, startY);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, '#ffffff');

    context.fillStyle = gradient;
    context.fillRect(x, y, barWidth, height);

    context.fillStyle = color;
    context.fillRect(x, y, barWidth, 6);

    context.fillStyle = '#0f172a';
    context.font = '12px Arial';
    context.textAlign = 'center';
    context.fillText(`${percent.toFixed(1)}%`, x + barWidth / 2, y - 8);
    context.fillText(row.candidate, x + barWidth / 2, startY + 24);
  });
}

function renderWinnerCards(resultMap, isClosed) {
  const winnerArea = document.getElementById('adminWinnerArea');
  if (!winnerArea) return;

  if (!isClosed) {
    winnerArea.innerHTML = '<p>The winners are shown once voting has closed.</p>';
    return;
  }

  const winnerCards = Object.entries(resultMap).map(([position, rows]) => {
    const totalVotes = rows.reduce((sum, row) => sum + row.count, 0);
    const topRows = Array.isArray(rows) ? rows.filter((row) => row.count === rows[0]?.count) : [];
    if (!topRows.length) {
      return `
        <div class="winner-card">
          <h3>${getPositionLabel(position)}</h3>
          <p>No votes recorded for this position.</p>
        </div>
      `;
    }

    const tied = topRows.length > 1;
    const winnerCandidates = topRows.map((row) => row.candidate).join(', ');
    const topCount = topRows[0].count;
    const percent = totalVotes ? ((topCount / totalVotes) * 100).toFixed(1) : '0.0';

    const winnerPhoto = !tied && topRows[0].photoPath
      ? `<div class="winner-photo"><img src="${topRows[0].photoPath}" alt="${topRows[0].candidate}" /> </div>`
      : '';

    const title = tied ? 'Tie' : winnerCandidates;
    const subtitle = tied
      ? `Tie between ${winnerCandidates} with ${topCount} vote${topCount === 1 ? '' : 's'} each (${percent}% of votes)`
      : `${percent}% of votes (${topCount} vote${topCount === 1 ? '' : 's'})`;

    return `
      <div class="winner-card">
        ${winnerPhoto}
        <h3>${getPositionLabel(position)}</h3>
        <p class="winner-name">${title}</p>
        <p class="winner-subtext">${subtitle}</p>
      </div>
    `;
  });

  winnerArea.innerHTML = winnerCards.join('');
}

function renderAdminCharts(data) {
  const container = document.getElementById('adminChartArea');
  if (!container) return;

  container.innerHTML = '';
  const resultMap = data.results || {};
  const isClosed = typeof data.isClosed === 'boolean' ? data.isClosed : !data.isOpen;

  renderWinnerCards(resultMap, isClosed);

  Object.entries(resultMap).forEach(([position, rows]) => {
    renderChartCard(position, rows || []);
  });

  const adminMessage = document.getElementById('adminMessage');
  if (adminMessage) {
    adminMessage.textContent = isClosed ? 'Election is closed. Download the PDF report from the admin portal.' : 'Election remains open. Results will be available once voting closes.';
  }
}

function loadAdminResults() {
  const storedAdmin = getStoredAdmin();
  if (!storedAdmin) {
    return;
  }

  const query = new URLSearchParams({
    fullName: storedAdmin.fullName,
    password: storedAdmin.password
  });

  fetch(`/api/admin/results?${query.toString()}`)
    .then((response) => response.json())
    .then((data) => {
      if (data.error) {
        const adminMessage = document.getElementById('adminMessage');
        if (adminMessage) {
          adminMessage.textContent = data.error;
        }
        return;
      }

      renderAdminCharts(data);
    })
    .catch(() => {
      const adminMessage = document.getElementById('adminMessage');
      if (adminMessage) {
        adminMessage.textContent = 'Unable to load admin results.';
      }
    });
}

function printAdminResults() {
  const winnerArea = document.getElementById('adminWinnerArea');
  const chartArea = document.getElementById('adminChartArea');
  if (!winnerArea || !chartArea || typeof window.jspdf === 'undefined' || typeof window.html2canvas === 'undefined') {
    window.print();
    return;
  }

  const pdf = new window.jspdf.jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Washington Outlaws Election Results', pageWidth / 2, 20, { align: 'center' });
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, 28, { align: 'center' });

  const renderSection = (element, yStart) => {
    return window.html2canvas(element, { backgroundColor: '#ffffff', scale: 2 }).then((canvas) => {
      const imageData = canvas.toDataURL('image/png');
      const imgWidth = pageWidth - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let yPosition = yStart;

      if (yPosition + imgHeight > pageHeight - 10) {
        pdf.addPage();
        yPosition = 10;
      }

      pdf.addImage(imageData, 'PNG', 10, yPosition, imgWidth, imgHeight);
      return yPosition + imgHeight + 10;
    });
  };

  const appendCongratulations = (currentY) => {
    let congratsY = currentY + 10;
    if (congratsY > pageHeight - 25) {
      pdf.addPage();
      congratsY = 20;
    }

    pdf.setFontSize(14);
    pdf.setTextColor('#1f2937');
    pdf.setFont('helvetica', 'bold');
    pdf.text('Congratulations to the winners and everyone who participated!', pageWidth / 2, congratsY, { align: 'center' });
  };

  renderSection(winnerArea, 34)
    .then((nextY) => renderSection(chartArea, nextY))
    .then((nextY) => {
      appendCongratulations(nextY);
      pdf.save('washington-outlaws-election-results.pdf');
    })
    .catch(() => {
      window.print();
    });
}

function loadAdminStatus() {
  fetch('/api/admin/status')
    .then((response) => response.json())
    .then((status) => {
      const statusBox = document.getElementById('adminStatus');
      if (statusBox) {
        statusBox.textContent = `Current window: ${status.startTime || 'Not set'} to ${status.endTime || 'Not set'} (${status.isOpen ? 'Open' : 'Closed'})`;
      }

      const startInput = document.getElementById('startTimeInput');
      const endInput = document.getElementById('endTimeInput');
      if (startInput && status.startTime) {
        startInput.value = toDateTimeLocalValue(status.startTime);
      }
      if (endInput && status.endTime) {
        endInput.value = toDateTimeLocalValue(status.endTime);
      }
    })
    .catch(() => {
      const statusBox = document.getElementById('adminStatus');
      if (statusBox) {
        statusBox.textContent = 'Unable to load election schedule.';
      }
    });
}

function initAdminPage() {
  const storedAdmin = getStoredAdmin();
  adminSession = storedAdmin;
  applyAdminState();
  loadAdminStatus();

  fetchPositions()
    .then(() => {
      populatePositionSelects();
      if (storedAdmin) {
        loadAdminContestants();
      }
    })
    .catch(() => {
      const positionSelect = document.getElementById('contestantPosition');
      if (positionSelect) {
        positionSelect.innerHTML = '<option value="">Unable to load positions</option>';
      }
    });

  const adminLoginForm = document.getElementById('adminLoginForm');
  if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const username = document.getElementById('adminUsername').value.trim();
      const password = document.getElementById('adminPassword').value.trim();

      fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.error) {
            window.alert(data.error);
            return;
          }

          adminSession = data;
          setStoredAdmin(data);
          applyAdminState();
          loadAdminStatus();
          loadAdminResults();
          loadAdminPositions();
          loadAdminContestants();
        })
        .catch(() => {
          window.alert('Admin login failed.');
        });
    });
  }

  const adminSettingsForm = document.getElementById('adminSettingsForm');
  if (adminSettingsForm) {
    adminSettingsForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const stored = getStoredAdmin();
      if (!stored) {
        window.alert('Please log in as admin first.');
        return;
      }

      const startInput = document.getElementById('startTimeInput');
      const endInput = document.getElementById('endTimeInput');
      const startTime = new Date(startInput.value).toISOString();
      const endTime = new Date(endInput.value).toISOString();
      fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: stored.fullName, password: stored.password, startTime, endTime })
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.error) {
            window.alert(data.error);
            return;
          }

          const statusBox = document.getElementById('adminStatus');
          if (statusBox) {
            statusBox.textContent = `Schedule updated: ${data.startTime} to ${data.endTime}`;
          }
        })
        .catch(() => {
          window.alert('Unable to update election schedule.');
        });
    });
  }

  const adminCloseVotingButton = document.getElementById('adminCloseVotingButton');
  if (adminCloseVotingButton) {
    adminCloseVotingButton.addEventListener('click', () => {
      const stored = getStoredAdmin();
      if (!stored) {
        window.alert('Please log in as admin first.');
        return;
      }

      fetch('/api/admin/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: stored.fullName, password: stored.password })
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.error) {
            window.alert(data.error);
            return;
          }

          const statusBox = document.getElementById('adminStatus');
          if (statusBox) {
            statusBox.textContent = `Voting closed now at ${data.endTime}.`;
          }

          const adminMessage = document.getElementById('adminMessage');
          if (adminMessage) {
            adminMessage.textContent = 'Voting has been ended early by the admin.';
          }

          loadAdminResults();
          loadAdminStatus();
        })
        .catch(() => {
          window.alert('Unable to close voting now.');
        });
    });
  }

  const contestantForm = document.getElementById('adminContestantForm');
  if (contestantForm) {
    contestantForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const stored = getStoredAdmin();
      if (!stored) {
        window.alert('Please log in as admin first.');
        return;
      }

      const formData = new FormData();
      formData.append('username', stored.fullName);
      formData.append('password', stored.password);
      formData.append('name', document.getElementById('contestantName').value.trim());
      formData.append('position', document.getElementById('contestantPosition').value);

      const photo = document.getElementById('contestantPhoto').files[0];
      if (photo) {
        formData.append('photo', photo);
      }

      fetch('/api/admin/contestants', {
        method: 'POST',
        body: formData
      })
        .then((response) => response.json())
        .then((data) => {
          const contestantMessage = document.getElementById('contestantMessage');
          if (data.error) {
            if (contestantMessage) contestantMessage.textContent = data.error;
            return;
          }

          if (contestantMessage) {
            contestantMessage.textContent = data.message || 'Contestant saved.';
          }
          contestantForm.reset();
          populateFields();
          loadAdminContestants();
        })
        .catch(() => {
          const contestantMessage = document.getElementById('contestantMessage');
          if (contestantMessage) contestantMessage.textContent = 'Unable to save contestant details.';
        });
    });
  }


  const voterForm = document.getElementById('adminVoterForm');
  if (voterForm) {
    voterForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const stored = getStoredAdmin();
      if (!stored) {
        window.alert('Please log in as admin first.');
        return;
      }

      const fullName = document.getElementById('voterFullName').value.trim();
      const uniqueId = document.getElementById('voterPassword').value.trim();
      const voterMessage = document.getElementById('voterMessage');

      if (!fullName || !uniqueId) {
        if (voterMessage) voterMessage.textContent = 'Both name and unique ID are required.';
        return;
      }

      fetch('/api/admin/voters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: stored.fullName,
          password: stored.password,
          fullName,
          uniqueId
        })
      })
        .then((response) => response.json())
        .then((data) => {
          if (voterMessage) {
            voterMessage.textContent = data.error || data.message || 'Voter added.';
          }
          if (!data.error) {
            voterForm.reset();
            loadVoterNames();
          }
        })
        .catch(() => {
          if (voterMessage) voterMessage.textContent = 'Unable to add voter.';
        });
    });
  }

  const positionForm = document.getElementById('adminPositionForm');
  if (positionForm) {
    positionForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const stored = getStoredAdmin();
      if (!stored) {
        window.alert('Please log in as admin first.');
        return;
      }

      const label = document.getElementById('positionLabel').value.trim();
      const positionMessage = document.getElementById('positionMessage');

      if (!label) {
        if (positionMessage) positionMessage.textContent = 'A position label is required.';
        return;
      }

      fetch('/api/admin/positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: stored.fullName,
          password: stored.password,
          label
        })
      })
        .then((response) => response.json())
        .then((data) => {
          if (positionMessage) {
            positionMessage.textContent = data.error || data.message || 'Position added.';
          }

          if (!data.error) {
            positionForm.reset();
            return fetchPositions();
          }

          return Promise.reject();
        })
        .then(() => {
          populatePositionSelects();
          renderVoteFields();
          populateFields();
        })
        .catch(() => {
          if (positionMessage && positionMessage.textContent === '') {
            positionMessage.textContent = 'Unable to create position.';
          }
        });
    });
  }

  const refreshAdminResults = document.getElementById('refreshAdminResults');
  if (refreshAdminResults) {
    refreshAdminResults.addEventListener('click', loadAdminResults);
  }

  const downloadPdfButton = document.getElementById('downloadPdfButton');
  if (downloadPdfButton) {
    downloadPdfButton.addEventListener('click', printAdminResults);
  }

  const logoutButton = document.getElementById('logoutButton');
  if (logoutButton) {
    logoutButton.addEventListener('click', () => {
      clearStoredAdmin();
      clearStoredUser();
      adminSession = null;
      loggedInUser = null;
      applyAdminState();
      refreshNavUser();
      window.location.href = '/';
    });
  }

  if (storedAdmin) {
    loadAdminResults();
    loadAdminPositions();
    loadAdminContestants();
  }
}

function initHomePage() {
  refreshNavUser();
  loadVoterNames();
  fetchPositions()
    .then(populateFields)
    .catch(() => {
      const container = document.getElementById('contestantSections');
      if (container) {
        container.innerHTML = '<p>Unable to load positions and contestants.</p>';
      }
    });
  applyLoginState();

  const navLogin = document.getElementById('navLoginForm');
  if (navLogin) {
    navLogin.addEventListener('submit', login);
  }

  const logoutButton = document.getElementById('logoutButton');
  if (logoutButton) {
    logoutButton.addEventListener('click', () => {
      clearStoredUser();
      loggedInUser = null;
      applyLoginState();
      refreshNavUser();

      const voteMessage = document.getElementById('voteMessage');
      if (voteMessage) {
        voteMessage.textContent = 'You have been logged out. Please log in to continue.';
      }
    });
  }
}

function initVotePage() {
  refreshNavUser();
  fetchPositions()
    .then(() => {
      renderVoteFields();
      populateFields();
    })
    .catch(() => {
      const voteGrid = document.querySelector('.vote-grid');
      if (voteGrid) {
        voteGrid.innerHTML = '<p>Unable to load voting positions.</p>';
      }
    });

  loadResults();
  loadElectionTimer();

  const stored = getStoredUser();
  if (!stored) {
    window.location.href = '/';
    return;
  }

  loggedInUser = stored;
  document.getElementById('voteUserName').textContent = `Voting as: ${stored.fullName}`;
  if (stored.hasVoted) {
    document.getElementById('voteMessage').textContent = 'This voter has already submitted a ballot.';
    lockVoteForm();
  }

  const voteForm = document.getElementById('voteForm');
  if (voteForm) {
    voteForm.addEventListener('submit', submitVote);
  }

  const logoutButton = document.getElementById('logoutButton');
  if (logoutButton) {
    logoutButton.classList.remove('hidden');
    logoutButton.addEventListener('click', () => {
      clearStoredUser();
      loggedInUser = null;
      window.location.href = '/';
    });
  }
}

function runPageInit() {
  const page = document.body.dataset.page;
  if (page === 'home') {
    initHomePage();
  }
  if (page === 'vote') {
    initVotePage();
  }
  if (page === 'admin') {
    initAdminPage();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', runPageInit);
} else {
  runPageInit();
}
