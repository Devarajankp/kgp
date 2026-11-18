function doGet(e) {
  // 1. iPhone Shortcut API Response
  if (e.parameter.api === 'true') {
    const data = getGoldData();
    let textOutput = "Kerala Gold Live (22K)\n\n";
    
    // If the price changed multiple times today, show all entries
    if (data.todayCombined.length > 1) {
      textOutput += "Today's Updates:\n";
      data.todayCombined.forEach(row => {
        textOutput += `${row.date} - ${row.pavan} | ${row.gram}\n`;
      });
      textOutput += `\nNet Change: ${data.pChange}`;
    } else {
      // If it only updated once, show the clean single line
      textOutput += `${data.latestDate} - ${data.latestPavan} | ${data.latestGram} (${data.pChange})`;
    }
    
    return ContentService.createTextOutput(textOutput);
  }
  
  // 2. Web App UI
  return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('Kerala Gold Pro')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getGoldData() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = Math.max(sheet.getLastRow(), 2);
  
  const pavanRange = sheet.getRange("A2:B" + lastRow).getDisplayValues();
  // FIXED: Gram data is in Columns D (Date) and E (Price)
  const gramRange = sheet.getRange("D2:E" + lastRow).getDisplayValues(); 
  
  let combinedHistory = [];
  
  function extractNum(str) {
    if(!str) return 0;
    return parseInt(str.replace(/[^0-9]/g, ''), 10);
  }
  
  for (let i = 0; i < pavanRange.length; i++) {
    if (pavanRange[i][0] || gramRange[i][0]) {
      combinedHistory.push({
        date: pavanRange[i][0] || gramRange[i][0],
        pavan: pavanRange[i][1] || "--",
        gram: gramRange[i][1] || "--"
      });
    }
  }
  
  // Dynamically calculate the historical differences (+/-) row by row
  for (let i = 0; i < combinedHistory.length; i++) {
     if (i > 0) {
        let pDiff = extractNum(combinedHistory[i].pavan) - extractNum(combinedHistory[i-1].pavan);
        combinedHistory[i].trendPavan = pDiff !== 0 ? (pDiff > 0 ? `+₹${pDiff}` : `-₹${Math.abs(pDiff)}`) : "--";
        
        let gDiff = extractNum(combinedHistory[i].gram) - extractNum(combinedHistory[i-1].gram);
        combinedHistory[i].trendGram = gDiff !== 0 ? (gDiff > 0 ? `+₹${gDiff}` : `-₹${Math.abs(gDiff)}`) : "--";
     } else {
        combinedHistory[i].trendPavan = "--";
        combinedHistory[i].trendGram = "--";
     }
  }

  // Filter for today's entries
  const now = new Date();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const todayStr = now.getDate() + "-" + months[now.getMonth()];
  
  const todayCombined = combinedHistory.filter(row => row.date.includes(todayStr) || row.date.toLowerCase().includes('today'));
  
  let latestPavan = sheet.getRange("F3").getDisplayValue();
  let latestGram = sheet.getRange("F2").getDisplayValue();
  let pChange = sheet.getRange("H3").getDisplayValue();
  let gChange = sheet.getRange("H2").getDisplayValue();
  
  if (todayCombined.length > 0) {
     latestPavan = todayCombined[todayCombined.length - 1].pavan;
     latestGram = todayCombined[todayCombined.length - 1].gram;
  }

  return {
    timestamp: now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
    latestDate: todayCombined.length > 0 ? todayCombined[todayCombined.length - 1].date : todayStr,
    latestPavan: latestPavan,
    latestGram: latestGram,
    pChange: pChange,
    gChange: gChange,
    todayCombined: todayCombined,
    combinedHistory: combinedHistory.reverse() // Newest at the top
  };
}