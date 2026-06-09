// ============================================
// NTC Exam Prep - Leaderboard Logic
// Handles ranking logic and display
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  if (!document.querySelector('.leaderboard-table-wrapper')) return;
  
  // Mock data for leaderboard
  const mockLeaderboardData = [
    { id: 1, name: 'Emmanuel Osei', school: 'Accra College of Education', score: 98, exams: 12, avatar: 'EO' },
    { id: 2, name: 'Sarah Mensah', school: 'Wesley College', score: 95, exams: 15, avatar: 'SM' },
    { id: 3, name: 'Kwame Appiah', school: 'PTE College', score: 94, exams: 10, avatar: 'KA' },
    { id: 4, name: 'Grace Addo', school: 'Aburi Training College', score: 92, exams: 8, avatar: 'GA' },
    { id: 5, name: 'David Tetteh', school: 'Ada College of Education', score: 89, exams: 14, avatar: 'DT' },
    { id: 6, name: 'Ama Asare', school: 'St. Louis College', score: 88, exams: 9, avatar: 'AA' },
    { id: 7, name: 'John Kufuor', school: 'Akrokerri College', score: 87, exams: 11, avatar: 'JK' },
    { id: 8, name: 'Rita Boakye', school: 'Berekum College', score: 85, exams: 7, avatar: 'RB' },
    { id: 9, name: 'Samuel Gyan', school: 'Enchi College', score: 84, exams: 6, avatar: 'SG' },
    { id: 10, name: 'Mary Ofori', school: 'Foso College', score: 82, exams: 13, avatar: 'MO' }
  ];

  initLeaderboard();

  function initLeaderboard() {
    // Add current user if they have taken exams
    let leaderboardData = [...mockLeaderboardData];
    
    if (localStorage.getItem('ntc_exam_results')) {
      const history = JSON.parse(localStorage.getItem('ntc_exam_results'));
      if (history.length > 0) {
        // Calculate user avg
        const totalPercentage = history.reduce((acc, curr) => acc + curr.percentage, 0);
        const avgScore = Math.round(totalPercentage / history.length);
        
        let userName = 'You';
        const userStr = localStorage.getItem('ntc_user');
        if (userStr) {
          const user = JSON.parse(userStr);
          userName = user.fullName || user.email.split('@')[0];
        }
        
        leaderboardData.push({
          id: 'current_user',
          name: userName + ' (You)',
          school: 'Your Dashboard',
          score: avgScore,
          exams: history.length,
          avatar: userName.substring(0, 2).toUpperCase(),
          isCurrentUser: true
        });
        
        // Re-sort
        leaderboardData.sort((a, b) => b.score - a.score);
      }
    }
    
    renderPodium(leaderboardData.slice(0, 3));
    renderTable(leaderboardData);
  }

  function renderPodium(topThree) {
    const podiumContainer = document.getElementById('podiumContainer');
    if (!podiumContainer || topThree.length < 3) return;
    
    // Order for podium display: 2nd, 1st, 3rd
    const podiumOrder = [topThree[1], topThree[0], topThree[2]];
    
    let html = '';
    podiumOrder.forEach((user, index) => {
      // index 0 is silver, 1 is gold, 2 is bronze
      html += `
        <div class="podium-item reveal" style="transition-delay: ${index * 0.2}s">
          <div class="avatar avatar-lg podium-avatar">${user.avatar}</div>
          <div class="podium-name">${user.name.split(' ')[0]}</div>
          <div class="podium-score">${user.score}% Avg</div>
          <div class="podium-bar">
            ${index === 1 ? '1st' : index === 0 ? '2nd' : '3rd'}
          </div>
        </div>
      `;
    });
    
    podiumContainer.innerHTML = html;
  }

  function renderTable(data) {
    const tableBody = document.getElementById('leaderboardTableBody');
    if (!tableBody) return;
    
    let html = '';
    
    data.forEach((user, index) => {
      const rank = index + 1;
      let rankClass = '';
      if (rank === 1) rankClass = 'gold';
      else if (rank === 2) rankClass = 'silver';
      else if (rank === 3) rankClass = 'bronze';
      
      const rowStyle = user.isCurrentUser ? 'background: var(--primary-ghost); font-weight: 600;' : '';
      
      let badgesHtml = '';
      if (user.score >= 90) badgesHtml += '<span class="badge badge-accent">Scholar</span>';
      if (user.exams >= 10) badgesHtml += '<span class="badge badge-primary">Dedicated</span>';
      
      html += `
        <tr style="${rowStyle}" class="reveal" style="transition-delay: ${(index * 0.05)}s">
          <td class="leaderboard-rank ${rankClass}">#${rank}</td>
          <td>
            <div class="leaderboard-user">
              <div class="avatar avatar-sm">${user.avatar}</div>
              <div class="leaderboard-user-info">
                <h5>${user.name}</h5>
                <p>${user.school}</p>
              </div>
            </div>
          </td>
          <td class="leaderboard-score">${user.score}%</td>
          <td>${user.exams}</td>
          <td>
            <div class="leaderboard-badges">
              ${badgesHtml}
            </div>
          </td>
        </tr>
      `;
    });
    
    tableBody.innerHTML = html;
  }
});
