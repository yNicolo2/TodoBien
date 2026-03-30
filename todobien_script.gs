// ═══════════════════════════════════════════════════════════════════════
//   TODO BIEN CLÍNICA DENTAL — Google Apps Script v13
//   Dr. Luján | Cirujano Dentista
//   Jr. Las Drusas 174A, Urb. Las Flores, SJL, Lima
//   Última actualización: 2026-03-30
// ═══════════════════════════════════════════════════════════════════════

// ▼▼▼ PEGA AQUÍ EL ID DE LA PLANTILLA (después de ejecutar crearPlantillaRecibo) ▼▼▼
var PLANTILLA_DOC_ID = "";
// ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

var SPREADSHEET_ID   = "1PG-EkM6OB303rusmhs10n9_9c6aGn4EnH1qJsfAaXtI";
var DURACION_MIN     = 90;

var SH_CITAS     = "CITAS";
var SH_AGENDA    = "AGENDA";
var SH_HISTORIA  = "HISTORIA CLINICA";
var SH_ODONTO    = "ODONTOGRAMA";
var SH_DASHBOARD = "INICIO";

// ── Paleta de colores (misma que el sitio web) ──────────────────────────
var P = {
  azulOsc : "#0d1f3c",
  azul    : "#1a56c4",
  azul2   : "#0f3a8a",
  mint    : "#bdd4f5",
  sage    : "#e8f0fb",
  cream   : "#f5f8ff",
  muted   : "#5b7aaa",
  border  : "#c5d8f5",
  blanco  : "#ffffff",
  gris    : "#f0f4ff",
  ink     : "#0d1f3c",
};

// ── Colores por servicio ────────────────────────────────────────────────
var COLORES = {
  "Limpieza y Prevencion"         : { bg:"#e0f4ff", txt:"#0f3a8a" },
  "Blanqueamiento"                : { bg:"#fffbe6", txt:"#b45309" },
  "Ortodoncia y Brackets"         : { bg:"#e8f0fb", txt:"#1a56c4" },
  "Endodoncia"                    : { bg:"#fce8e8", txt:"#b91c1c" },
  "Rehabilitacion Oral y Protesis": { bg:"#e8f5e9", txt:"#166534" },
  "Estetica Dental"               : { bg:"#f3ecfb", txt:"#6d28d9" },
  "Consulta general"              : { bg:"#f0f4ff", txt:"#374151" },
};
var COL_DEF = { bg:"#e8f0fb", txt:"#0f3a8a" };

var ESTADO_COL = {
  "Confirmada" : "#dbeafe",
  "Atendida"   : "#dcfce7",
  "Cancelada"  : "#fee2e2",
  "No asistio" : "#fef9c3",
};

// ═══════════════════════════════════════════════════════════════════════
//   ENDPOINT WEB
// ═══════════════════════════════════════════════════════════════════════

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (!p.action) return json({ ok:true, version:"v13" });
  try {
    if (p.action === "check")            return json(checkDisponibilidad(p));
    if (p.action === "save")             return json(guardarCita(p));
    if (p.action === "getCitas")         return json(obtenerCitas());
    if (p.action === "reprogramar")      return json(reprogramarCita(p));
    if (p.action === "updateCita")       return json(updateCita(p));
    if (p.action === "updateConfirmacion") return json(updateConfirmacion(p));
    return json({ error:"Accion desconocida: " + p.action });
  } catch(err) {
    Logger.log("doGet error: " + err);
    return json({ error: err.toString() });
  }
}
function doPost(e) { return json({ error:"Usa GET" }); }

// ═══════════════════════════════════════════════════════════════════════
//   LÓGICA DE CITAS
// ═══════════════════════════════════════════════════════════════════════

function checkDisponibilidad(p) {
  if (!p.fecha || !p.hora) return { error:"Faltan fecha u hora" };
  var dur   = parseInt(p.duracion) || DURACION_MIN;
  var sheet = abrirHoja(SH_CITAS);
  if (!sheet || sheet.getLastRow() <= 1) return { disponible:true };
  var data  = sheet.getRange(2,1,sheet.getLastRow()-1,9).getDisplayValues(); // hasta Hora Cita
  var ni    = hMin(p.hora.trim()), nf = ni + dur;
  for (var i=0; i<data.length; i++) {
    var row = data[i];
    if (String(row[6]).trim() !== p.fecha.trim()) continue;
    var ci = hMinFlex(String(row[7]).trim().replace(/^'/,""));
    if (ci < 0) continue;
    var cf = ci + dur;
    if (ni < cf && nf > ci) return { disponible:false, siguiente:mStr(cf) };
  }
  return { disponible:true };
}

function guardarCita(p) {
  if (!p.nombre || !p.telefono || !p.fecha_pref || !p.hora_pref || !p.servicio || !p.doctor)
    return { success:false, error:"Faltan campos obligatorios" };
  var chk = checkDisponibilidad({ fecha:p.fecha_pref, hora:p.hora_pref });
  if (!chk.disponible)
    return { success:false, error:"Horario ocupado. Próximo libre: " + (chk.siguiente||"") };

  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = getOrCreate(ss, SH_CITAS, crearHojaCitas);
  var fe    = p.fecha_envio
    ? p.fecha_envio.trim()
    : Utilities.formatDate(new Date(),"America/Lima","dd/MM/yyyy HH:mm");
  var num  = sheet.getLastRow(); // número autoincremental (fila - 1)
  var fila = sheet.getLastRow() + 1;
  var col  = COLORES[(p.servicio||"").trim()] || COL_DEF;

  // Columnas: 1 N°, 2 FechaReg, 3 Nombre, 4 Teléfono, 5 DNI, 6 Servicio,
  // 7 FechaCita, 8 HoraCita, 9 Comentario, 10 Estado, 11 Pago,
  // 12 Consentimiento, 13 Doctor, 14 Recibo, 15 Confirmación
  sheet.appendRow([
    num, fe,
    (p.nombre     ||"").trim(),
    (p.telefono   ||"").trim(),
    (p.dni        ||"").trim(),
    (p.servicio   ||"").trim(),
    (p.fecha_pref ||"").trim(),
    (p.hora_pref  ||"").trim(),
    (p.comentario ||"").trim(),
    "Confirmada", "Pendiente",
    (p.consentimiento||"").trim(),
    (p.doctor     ||"").trim(),
    "VER RECIBO",
    false
  ]);
  sheet.getRange(fila,8).setNumberFormat("@");  // hora como texto
  sheet.getRange(fila,1,1,15).setBackground(col.bg);
  sheet.getRange(fila,6).setFontColor(col.txt).setFontWeight("bold");

  setDropdown(sheet.getRange(fila,10), ["Confirmada","Atendida","Cancelada","No asistio"]);
  setDropdown(sheet.getRange(fila,11), ["Pendiente","Pagado - Efectivo","Pagado - Yape","Pagado - Plin","Pagado - POS","Pagado - Tarjeta"]);

  sheet.getRange(fila,14)
    .setBackground(P.sage).setFontColor(P.azul)
    .setFontWeight("bold").setHorizontalAlignment("center").setFontSize(9);

  var rule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  sheet.getRange(fila,15).setDataValidation(rule).setValue(false);

  try { actualizarAgenda(); }    catch(e){ Logger.log("Agenda: "+e); }
  try { actualizarDashboard(); } catch(e){ Logger.log("Dashboard: "+e); }
  try { agregarAHistoria(p); }   catch(e){ Logger.log("Historia: "+e); }
  return { success:true };
}

function obtenerCitas() {
  var sheet = abrirHoja(SH_CITAS);
  if (!sheet || sheet.getLastRow()<=1) return { citas:[] };
  var data = sheet.getRange(2,1,sheet.getLastRow()-1,15).getDisplayValues();
  var citas = data.filter(function(r){ return r[2]; }).map(function(r){
    return {
      numero: r[0],
      fecha_envio: r[1],
      nombre: r[2],
      telefono: r[3],
      dni: r[4],
      servicio: r[5],
      fecha: r[6],
      hora: r[7].replace(/^'/,""),
      comentario: r[8],
      estado: r[9],
      pago: r[10],
      consentimiento: r[11],
      doctor: r[12],
      recibo: r[13],
      confirmacion: (r[14] === "true" || r[14] === "TRUE" || r[14] === true) ? true : false
    };
  });
  citas.sort(function(a,b){ var da=a.fecha+" "+a.hora,db=b.fecha+" "+b.hora; return da<db?-1:da>db?1:0; });
  return { citas:citas };
}

function reprogramarCita(p) {
  if (!p.numero||!p.fecha||!p.hora) return {success:false,error:"Faltan datos"};
  try {
    var ss   = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sh   = ss.getSheetByName(SH_CITAS);
    if (!sh||sh.getLastRow()<=1) return {success:false,error:"Sin datos"};
    var rows = sh.getRange(2,1,sh.getLastRow()-1,15).getValues();
    for (var i=0;i<rows.length;i++) {
      if (String(rows[i][0]).trim()===String(p.numero).trim()) {
        var fr = i+2;
        sh.getRange(fr,7).setValue(p.fecha);
        sh.getRange(fr,8).setValue(p.hora).setNumberFormat("@");
        sh.getRange(fr,10).setValue("Confirmada");
        try { actualizarAgenda(); }    catch(e){}
        try { actualizarDashboard(); } catch(e){}
        return {success:true};
      }
    }
    return {success:false,error:"Cita no encontrada"};
  } catch(err){ return {success:false,error:err.toString()}; }
}

function updateCita(p) {
  if (!p.numero) return {success:false,error:"Falta numero"};
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sh = ss.getSheetByName(SH_CITAS);
    if (!sh || sh.getLastRow()<=1) return {success:false,error:"Sin datos"};
    var rows = sh.getRange(2,1,sh.getLastRow()-1,15).getValues();
    for (var i=0;i<rows.length;i++) {
      if (String(rows[i][0]).trim()===String(p.numero).trim()) {
        var fr = i+2;
        if (p.estado) sh.getRange(fr,10).setValue(p.estado);
        if (p.pago)   sh.getRange(fr,11).setValue(p.pago);
        var bgE = ESTADO_COL[p.estado];
        if (bgE) sh.getRange(fr,10).setBackground(bgE).setFontWeight("bold");
        try { actualizarAgenda(); }    catch(e){}
        try { actualizarDashboard(); } catch(e){}
        return {success:true};
      }
    }
    return {success:false,error:"Cita #"+p.numero+" no encontrada"};
  } catch(err){ return {success:false,error:err.toString()}; }
}

function updateConfirmacion(p) {
  if (!p.numero || p.confirmacion === undefined) return {success:false,error:"Faltan datos"};
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sh = ss.getSheetByName(SH_CITAS);
    if (!sh || sh.getLastRow()<=1) return {success:false,error:"Sin datos"};
    var rows = sh.getRange(2,1,sh.getLastRow()-1,15).getValues();
    for (var i=0;i<rows.length;i++) {
      if (String(rows[i][0]).trim()===String(p.numero).trim()) {
        var fr = i+2;
        var confirmVal = (p.confirmacion === "true" || p.confirmacion === true) ? true : false;
        sh.getRange(fr,15).setValue(confirmVal);
        try { actualizarAgenda(); }    catch(e){}
        try { actualizarDashboard(); } catch(e){}
        return {success:true};
      }
    }
    return {success:false,error:"Cita #"+p.numero+" no encontrada"};
  } catch(err){ return {success:false,error:err.toString()}; }
}

// ═══════════════════════════════════════════════════════════════════════
//   HISTORIA CLÍNICA (sin cambios)
// ═══════════════════════════════════════════════════════════════════════
function agregarAHistoria(p) {
  var dni = (p.dni||"").trim();
  if (!dni) return;
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = getOrCreate(ss, SH_HISTORIA, crearHojaHistoria);
  var lastRow = sheet.getLastRow();
  if (lastRow >= 5) {
    var dnis = sheet.getRange(5,1,lastRow-4,1).getValues();
    for (var i=0; i<dnis.length; i++)
      if (String(dnis[i][0]).trim()===dni) return;
  }
  var fila = sheet.getLastRow() + 1;
  sheet.appendRow([
    dni, (p.nombre||"").trim(), (p.telefono||"").trim(),
    Utilities.formatDate(new Date(),"America/Lima","dd/MM/yyyy"),
    (p.servicio||"").trim(),"","","","","","","Activo"
  ]);
  sheet.getRange(fila,1,1,12).setBackground(P.cream);
  sheet.getRange(fila,1).setFontWeight("bold").setFontColor(P.azulOsc);
  sheet.getRange(fila,12).setBackground(P.sage).setFontColor(P.azul).setFontWeight("bold");
  setDropdown(sheet.getRange(fila,12), ["Activo","Tratamiento en curso","Alta","Inactivo"]);
  for (var d=0; d<32; d++) {
    var cel = sheet.getRange(fila, 13+d);
    cel.setBackground(P.blanco).setHorizontalAlignment("center")
       .setFontSize(8).setFontColor(P.muted);
    setDropdown(cel, ["","Sano","Caries","Obturado","Corona","Extraccion","Implante","Puente","Fractura","En tratamiento"]);
  }
  sheet.getRange(fila,1,1,44)
    .setBorder(false,false,true,false,false,false,P.border,SpreadsheetApp.BorderStyle.SOLID);
}

// ═══════════════════════════════════════════════════════════════════════
//   AGENDA MENSUAL (actualizada para 15 columnas)
// ═══════════════════════════════════════════════════════════════════════
function actualizarAgenda() {
  var ss       = SpreadsheetApp.openById(SPREADSHEET_ID);
  var citSheet = ss.getSheetByName(SH_CITAS);
  var data     = [];
  if (citSheet && citSheet.getLastRow()>1)
    data = citSheet.getRange(2,1,citSheet.getLastRow()-1,15).getDisplayValues();

  var sheet = getOrCreate(ss, SH_AGENDA, null);
  sheet.setFrozenRows(0); sheet.clearContents(); sheet.clearFormats();

  var MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
               "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  var citas = data.filter(function(r){ return r[6]&&r[7]; });
  citas.sort(function(a,b){ var da=a[6]+" "+a[7],db=b[6]+" "+b[7]; return da<db?-1:da>db?1:0; });

  var grupos = {};
  citas.forEach(function(r){ var k=r[6].substring(0,7); if(!grupos[k])grupos[k]=[]; grupos[k].push(r); });

  var f = 1;
  bloque(sheet,f,["AGENDA  —  Todo Bien Clínica Dental  |  Dr. Luján"],13,P.azulOsc,P.blanco,13,true,42); f++;

  if (!Object.keys(grupos).length) {
    sheet.getRange(f,1).setValue("Sin citas. Aparecerán aquí automáticamente.")
      .setFontColor(P.muted).setFontStyle("italic").setFontSize(10);
    sheet.setFrozenRows(1); anchos(sheet); return;
  }

  Object.keys(grupos).sort().forEach(function(key){
    var pts = key.split("-");
    var nm  = MESES[parseInt(pts[1],10)-1].toUpperCase()+"   "+pts[0];
    var cm  = grupos[key];

    bloque(sheet,f,[nm+"   ("+cm.length+" cita"+(cm.length!==1?"s":"")+")"],13,P.azul,P.blanco,11,true,30); f++;

    var COLS = ["N°","Registrado","Nombre","Teléfono","DNI","Servicio","Fecha","Hora","Comentario","Estado","Pago","Consentimiento","Doctor","Recibo"];
    sheet.getRange(f,1,1,14).setValues([COLS])
      .setBackground(P.sage).setFontColor(P.azulOsc)
      .setFontWeight("bold").setFontSize(9)
      .setBorder(false,false,true,false,false,false,P.border,SpreadsheetApp.BorderStyle.SOLID);
    sheet.setRowHeight(f,22); f++;

    cm.forEach(function(r,idx){
      var col = COLORES[r[5]]||COL_DEF;
      var fp  = r[6].split("-");
      var fD  = fp.length===3 ? fp[2]+"/"+fp[1]+"/"+fp[0] : r[6];
      var hD  = fmt12(r[7].replace(/^'/,""));
      var bg  = idx%2===0 ? col.bg : lighten(col.bg);
      sheet.getRange(f,1,1,14).setValues([[r[0],r[1],r[2],r[3],r[4],r[5],fD,hD,r[8],r[9],r[10],r[11],r[12],"VER RECIBO"]])
        .setBackground(bg).setFontSize(9).setVerticalAlignment("middle")
        .setBorder(false,false,true,false,false,false,P.border,SpreadsheetApp.BorderStyle.SOLID);
      sheet.getRange(f,6).setFontColor(col.txt).setFontWeight("bold");
      var bgE = ESTADO_COL[r[9]]; if(bgE) sheet.getRange(f,10).setBackground(bgE).setFontWeight("bold");
      sheet.getRange(f,13).setFontWeight("bold");
      sheet.getRange(f,14).setBackground(P.sage).setFontColor(P.azul).setFontWeight("bold").setHorizontalAlignment("center");
      sheet.setRowHeight(f,22); f++;
    });

    sheet.getRange(f,1,1,13).setBackground(P.gris); sheet.setRowHeight(f,6); f++;
  });

  bloque(sheet,f,["TOTAL: "+citas.length+" cita"+(citas.length!==1?"s":"")],13,P.azulOsc,P.blanco,10,true,26);
  anchos(sheet);
  sheet.setFrozenRows(1);
  Logger.log("Agenda actualizada: "+citas.length+" citas");
}

// ═══════════════════════════════════════════════════════════════════════
//   DASHBOARD (actualizado para 15 columnas, pero solo usa hasta pago)
// ═══════════════════════════════════════════════════════════════════════
function actualizarDashboard() {
  var ss       = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet    = getOrCreate(ss, SH_DASHBOARD, null);
  var citSheet = ss.getSheetByName(SH_CITAS);
  var hisSheet = ss.getSheetByName(SH_HISTORIA);

  sheet.setFrozenRows(0); sheet.clearContents(); sheet.clearFormats();

  var hoy    = Utilities.formatDate(new Date(),"America/Lima","yyyy-MM-dd");
  var mesKey = hoy.substring(0,7);
  var MESES  = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
                "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  var nomMes = MESES[parseInt(mesKey.split("-")[1],10)-1];

  var citas = [], totalPac = 0;
  if (citSheet && citSheet.getLastRow()>1)
    citas = citSheet.getRange(2,1,citSheet.getLastRow()-1,15).getDisplayValues()
      .filter(function(r){ return r[2]; });
  if (hisSheet && hisSheet.getLastRow()>4) totalPac = hisSheet.getLastRow()-4;

  var deHoy     = citas.filter(function(r){ return r[6]===hoy; });
  var citasMes  = citas.filter(function(r){ return r[6].substring(0,7)===mesKey; }).length;
  var atendidas = citas.filter(function(r){ return r[9]==="Atendida"; }).length;
  var pagoPend  = citas.filter(function(r){ return r[10]==="Pendiente"&&r[9]==="Atendida"; }).length;
  var canceladas= citas.filter(function(r){ return r[9]==="Cancelada"||r[9]==="No asistio"; }).length;
  var contServ  = {};
  citas.forEach(function(r){ if(r[5]) contServ[r[5]]=(contServ[r[5]]||0)+1; });
  var topServ   = Object.keys(contServ).sort(function(a,b){return contServ[b]-contServ[a];})[0]||"—";

  var f = 1;

  bloque(sheet,f,["INICIO  —  Todo Bien Clínica Dental  |  Dr. Luján"],4,P.azulOsc,P.blanco,13,true,44); f++;
  sheet.getRange(f,1).setValue("Actualizado: "+Utilities.formatDate(new Date(),"America/Lima","dd/MM/yyyy  HH:mm"))
    .setFontColor(P.muted).setFontSize(8).setFontStyle("italic");
  sheet.setRowHeight(f,16); f+=2;

  sheet.getRange(f,1).setValue("RESUMEN").setFontWeight("bold").setFontColor(P.azulOsc).setFontSize(10);
  sheet.setRowHeight(f,22); f++;
  var stats = [
    ["CITAS HOY",             deHoy.length,   P.sage,    P.azul    ],
    ["CITAS — "+nomMes.toUpperCase(), citasMes, "#e6f4ea","#15803d"],
    ["TOTAL PACIENTES",       totalPac,        "#f0ebff", "#6d28d9" ],
    ["ATENDIDAS (total)",     atendidas,       P.mint,    P.azulOsc ],
  ];
  stats.forEach(function(s,i){
    var col = i+1;
    sheet.getRange(f,col).setValue(s[0])
      .setBackground(s[2]).setFontColor(s[3]).setFontWeight("bold")
      .setFontSize(8).setHorizontalAlignment("center").setVerticalAlignment("middle");
    sheet.getRange(f+1,col).setValue(s[1])
      .setBackground(s[2]).setFontColor(s[3]).setFontWeight("bold")
      .setFontSize(30).setHorizontalAlignment("center").setVerticalAlignment("middle");
    sheet.setRowHeight(f,22); sheet.setRowHeight(f+1,48);
    sheet.setColumnWidth(col,150);
  }); f+=3;

  sheet.getRange(f,1).setValue("ALERTAS").setFontWeight("bold").setFontColor(P.azulOsc).setFontSize(10);
  sheet.setRowHeight(f,22); f++;
  var alertas = [];
  if (deHoy.length===0)  alertas.push(["Sin citas para hoy",    P.gris,    P.muted  ]);
  if (pagoPend>0)        alertas.push([pagoPend+" cita(s) con pago pendiente","#fff3cd","#92400e"]);
  if (canceladas>0)      alertas.push([canceladas+" cancelación(es) o ausencia(s)","#fee2e2","#9b1c1c"]);
  if (!alertas.length){
    sheet.getRange(f,1,1,4).setValue("  Todo en orden")
      .setBackground("#e6f4ea").setFontColor("#15803d").setFontWeight("bold").setFontSize(9);
    sheet.setRowHeight(f,22); f++;
  } else {
    alertas.forEach(function(a){
      sheet.getRange(f,1,1,4).setValue("  "+a[0])
        .setBackground(a[1]).setFontColor(a[2]).setFontSize(9);
      sheet.setRowHeight(f,22); f++;
    });
  }
  f++;

  sheet.getRange(f,1,1,4).setValue("  SERVICIO MÁS SOLICITADO:   "+topServ+"  ("+(contServ[topServ]||0)+" veces)")
    .setBackground(P.sage).setFontColor(P.azulOsc).setFontWeight("bold").setFontSize(9);
  sheet.setRowHeight(f,26); f+=2;

  bloque(sheet,f,["  CITAS DE HOY  ("+deHoy.length+")"],4,P.azul,P.blanco,10,true,28); f++;
  if (!deHoy.length){
    sheet.getRange(f,1,1,4).setValue("  No hay citas programadas para hoy")
      .setFontColor(P.muted).setFontStyle("italic").setFontSize(9);
    sheet.setRowHeight(f,18); f++;
  } else {
    sheet.getRange(f,1,1,4).setValues([["Hora","Paciente","Servicio","Estado"]])
      .setBackground(P.sage).setFontColor(P.azulOsc).setFontWeight("bold").setFontSize(9);
    sheet.setRowHeight(f,22); f++;
    deHoy.sort(function(a,b){ return a[7]<b[7]?-1:1; }).forEach(function(r){
      var col = COLORES[r[5]]||COL_DEF;
      sheet.getRange(f,1,1,4).setValues([[fmt12(r[7].replace(/^'/,"")),r[2],r[5],r[9]]])
        .setBackground(col.bg).setFontSize(9).setVerticalAlignment("middle");
      sheet.getRange(f,3).setFontColor(col.txt).setFontWeight("bold");
      var bgE = ESTADO_COL[r[9]]; if(bgE) sheet.getRange(f,4).setBackground(bgE).setFontWeight("bold");
      sheet.setRowHeight(f,22); f++;
    });
  }
  sheet.setFrozenRows(1);
  Logger.log("Dashboard actualizado");
}

// ═══════════════════════════════════════════════════════════════════════
//   RECIBO EN GOOGLE DOCS (sin cambios de doctor)
// ═══════════════════════════════════════════════════════════════════════
function crearPlantillaRecibo() {
  var doc  = DocumentApp.create("Plantilla Recibo — Todo Bien");
  var body = doc.getBody();
  body.setMarginTop(50).setMarginBottom(50).setMarginLeft(60).setMarginRight(60);
  var C = DocumentApp.HorizontalAlignment.CENTER;
  var L = DocumentApp.HorizontalAlignment.LEFT;

  var p1 = body.appendParagraph("CONSULTORIO DENTAL TODO BIEN");
  p1.setAlignment(C); p1.editAsText().setFontSize(18).setBold(true).setForegroundColor("#1a56c4");
  var p2 = body.appendParagraph("Dr. Luján  |  Cirujano Dentista");
  p2.setAlignment(C); p2.editAsText().setFontSize(11).setBold(true).setForegroundColor("#0f3a8a");
  var p3 = body.appendParagraph("Jr. Las Drusas 174A, Urb. Las Flores — San Juan de Lurigancho, Lima");
  p3.setAlignment(C); p3.editAsText().setFontSize(9).setForegroundColor("#5b7aaa");
  body.appendHorizontalRule();

  var p4 = body.appendParagraph("RECIBO DE ATENCIÓN  N° {{NUMERO}}");
  p4.setAlignment(C); p4.editAsText().setFontSize(14).setBold(true).setForegroundColor("#1a56c4");
  var p5 = body.appendParagraph("Fecha de emisión: {{FECHA_EMISION}}");
  p5.setAlignment(C); p5.editAsText().setFontSize(9).setForegroundColor("#5b7aaa");
  body.appendParagraph("");

  var sp = body.appendParagraph("DATOS DEL PACIENTE");
  sp.setAlignment(L); sp.editAsText().setFontSize(10).setBold(true).setForegroundColor("#1a56c4");
  var t1 = body.appendTable([["Nombre completo:","{{NOMBRE}}"],["DNI:","{{DNI}}"],["Teléfono:","{{TELEFONO}}"]]);
  t1.setColumnWidth(0,160).setColumnWidth(1,290);
  for (var i=0;i<3;i++){
    t1.getCell(i,0).editAsText().setBold(true).setForegroundColor("#5b7aaa");
    t1.getCell(i,1).editAsText().setBold(true).setForegroundColor("#0d1f3c");
  }
  body.appendParagraph("");

  var sa = body.appendParagraph("DETALLE DE LA ATENCIÓN");
  sa.setAlignment(L); sa.editAsText().setFontSize(10).setBold(true).setForegroundColor("#0f3a8a");
  var t2 = body.appendTable([["Servicio:","{{SERVICIO}}"],["Fecha:","{{FECHA_CITA}}"],["Hora:","{{HORA_CITA}}"],["Forma de pago:","{{PAGO}}"]]);
  t2.setColumnWidth(0,160).setColumnWidth(1,290);
  for (var i=0;i<4;i++){
    t2.getCell(i,0).editAsText().setBold(true).setForegroundColor("#5b7aaa");
    t2.getCell(i,1).editAsText().setBold(true).setForegroundColor("#0d1f3c");
  }
  body.appendParagraph("");

  var sm = body.appendParagraph("MONTO COBRADO");
  sm.setAlignment(L); sm.editAsText().setFontSize(10).setBold(true).setForegroundColor("#0f3a8a");
  var t3 = body.appendTable([["TOTAL (S/.):", "{{MONTO}}"]]);
  t3.setColumnWidth(0,160).setColumnWidth(1,290);
  t3.getCell(0,0).editAsText().setBold(true).setFontSize(12).setForegroundColor("#5b7aaa");
  t3.getCell(0,1).editAsText().setBold(true).setFontSize(18).setForegroundColor("#1a56c4");
  body.appendParagraph(""); body.appendParagraph("");

  var tf = body.appendTable([["_______________________","_______________________"],["Dr. Luján","Firma del Paciente"],["Cirujano Dentista",""]]);
  tf.setColumnWidth(0,225).setColumnWidth(1,225);
  tf.getCell(1,0).editAsText().setBold(true);
  tf.getCell(1,1).editAsText().setBold(true);
  body.appendHorizontalRule();

  var ppie = body.appendParagraph("Gracias por su preferencia  ·  Su salud dental es nuestra prioridad");
  ppie.setAlignment(C); ppie.editAsText().setFontSize(8).setForegroundColor("#5b7aaa");
  doc.saveAndClose();

  Logger.log("══════════════════════════════════");
  Logger.log("PLANTILLA CREADA — COPIA ESTE ID:");
  Logger.log(doc.getId());
  Logger.log("URL: " + doc.getUrl());
  Logger.log("══════════════════════════════════");
  Logger.log("Pegalo en PLANTILLA_DOC_ID (linea 7)");
}

function abrirReciboDeFila() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SH_CITAS);
  if (!sheet) { Logger.log("ERROR: hoja CITAS no encontrada"); return; }
  var fila  = sheet.getActiveCell().getRow();
  if (fila<=1) { Logger.log("ERROR: selecciona una fila de datos"); return; }
  var row   = sheet.getRange(fila,1,1,14).getValues()[0];
  var datos = { numero:row[0],nombre:row[2],telefono:row[3],dni:row[4],
                servicio:row[5],fecha:row[6],hora:row[7],pago:row[10] };
  if (!datos.nombre) { Logger.log("ERROR: fila sin datos de paciente"); return; }
  if (!PLANTILLA_DOC_ID) { Logger.log("ERROR: pega el ID en PLANTILLA_DOC_ID"); return; }
  var url = generarDocRecibo(datos);
  try {
    sheet.getRange(fila,14)
      .setFormula('=HYPERLINK("'+url+'","VER RECIBO")')
      .setBackground(P.sage).setFontColor(P.azul)
      .setFontWeight("bold").setHorizontalAlignment("center")
      .setFontSize(9);
  } catch(e){ Logger.log("Hyperlink: "+e); }
  Logger.log("Recibo listo. Abre: " + url);
}

function generarDocRecibo(datos) {
  var fp  = String(datos.fecha).split("-");
  var fD  = fp.length===3 ? fp[2]+"/"+fp[1]+"/"+fp[0] : String(datos.fecha);
  var hD  = fmt12(String(datos.hora).replace(/^'/,""));
  var num = String(datos.numero).padStart(4,"0");
  var hoy = Utilities.formatDate(new Date(),"America/Lima","dd/MM/yyyy  HH:mm");
  var copia = DriveApp.getFileById(PLANTILLA_DOC_ID).makeCopy("Recibo "+num+" — "+datos.nombre);
  var body  = DocumentApp.openById(copia.getId()).getBody();
  body.replaceText("\\{\\{NUMERO\\}\\}",       num);
  body.replaceText("\\{\\{FECHA_EMISION\\}\\}", hoy);
  body.replaceText("\\{\\{NOMBRE\\}\\}",        datos.nombre);
  body.replaceText("\\{\\{DNI\\}\\}",           datos.dni    ||"—");
  body.replaceText("\\{\\{TELEFONO\\}\\}",      datos.telefono);
  body.replaceText("\\{\\{SERVICIO\\}\\}",      datos.servicio);
  body.replaceText("\\{\\{FECHA_CITA\\}\\}",    fD);
  body.replaceText("\\{\\{HORA_CITA\\}\\}",     hD);
  body.replaceText("\\{\\{PAGO\\}\\}",          datos.pago   ||"—");
  body.replaceText("\\{\\{MONTO\\}\\}",         "S/. ___________");
  DocumentApp.openById(copia.getId()).saveAndClose();
  return "https://docs.google.com/document/d/" + copia.getId() + "/edit";
}

// ═══════════════════════════════════════════════════════════════════════
//   TRIGGER onEdit — recibo automático (actualizado: columna Estado es la 10)
// ═══════════════════════════════════════════════════════════════════════
function onEdit(e) {
  try {
    var range = e.range;
    if (range.getSheet().getName() !== SH_CITAS) return;
    if (range.getColumn() !== 10)  return; // columna Estado
    if (range.getRow()    <= 1)    return;
    if (range.getValue()  !== "Atendida") return;
    if (!PLANTILLA_DOC_ID) return;
    var row   = range.getSheet().getRange(range.getRow(),1,1,15).getValues()[0];
    var datos = { numero:row[0],nombre:row[2],telefono:row[3],dni:row[4],
                  servicio:row[5],fecha:row[6],hora:row[7],pago:row[10] };
    if (!datos.nombre) return;
    var url = generarDocRecibo(datos);
    range.getSheet().getRange(range.getRow(),14)
      .setFormula('=HYPERLINK("'+url+'","VER RECIBO")')
      .setBackground(P.sage).setFontColor(P.azul)
      .setFontWeight("bold").setHorizontalAlignment("center").setFontSize(9);
    Logger.log("Recibo auto: "+datos.nombre+" | "+url);
  } catch(err){ Logger.log("onEdit error: "+err); }
}

// ═══════════════════════════════════════════════════════════════════════
//   SETUP Y CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════════
function setupCompleto() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var mapRename = { "TODOBIEN": SH_CITAS, "SEMANA": SH_AGENDA };
  Object.keys(mapRename).forEach(function(old){
    var s = ss.getSheetByName(old);
    if (s) { s.setName(mapRename[old]); Logger.log("Renombrada: "+old+" → "+mapRename[old]); }
  });
  var hisOld = ss.getSheetByName(SH_HISTORIA);
  if (hisOld && hisOld.getLastRow()<=1) {
    ss.deleteSheet(hisOld);
  }
  getOrCreate(ss, SH_CITAS,     crearHojaCitas);
  getOrCreate(ss, SH_HISTORIA,  crearHojaHistoria);
  getOrCreate(ss, SH_AGENDA,    null);
  crearHojaOdontograma(ss);
  getOrCreate(ss, SH_DASHBOARD, null);
  actualizarAgenda();
  actualizarDashboard();
  Logger.log("Setup completo v13 OK");
  Logger.log("Pestañas: "+SH_DASHBOARD+" | "+SH_CITAS+" | "+SH_AGENDA+" | "+SH_HISTORIA);
}

function instalarTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction()==="onEdit") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("onEdit").forSpreadsheet(SPREADSHEET_ID).onEdit().create();
  agregarColumnaRecibo();
  Logger.log("Trigger onEdit instalado.");
}

function agregarColumnaRecibo() {
  var sheet = abrirHoja(SH_CITAS);
  if (!sheet) return;
  sheet.getRange(1,14).setValue("Recibo")
    .setBackground(P.azulOsc).setFontColor(P.blanco)
    .setFontWeight("bold").setHorizontalAlignment("center").setFontSize(10);
  sheet.setColumnWidth(14,110);
  for (var i=2; i<=sheet.getLastRow(); i++) {
    var cel = sheet.getRange(i,14);
    if (!cel.getFormula())
      cel.setValue("VER RECIBO").setBackground(P.sage).setFontColor(P.azul)
        .setFontWeight("bold").setHorizontalAlignment("center").setFontSize(9);
  }
  Logger.log("Columna Recibo lista.");
}

function borrarTodosLosPacientes() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  [SH_CITAS, SH_HISTORIA].forEach(function(n){
    var s = ss.getSheetByName(n);
    if (s && s.getLastRow()>1) {
      s.deleteRows(2, s.getLastRow()-1);
      Logger.log("Limpiada: " + n);
    }
  });
  actualizarAgenda();
  actualizarDashboard();
  Logger.log("Hojas limpiadas.");
}

function arreglarHoras() {
  var sheet = abrirHoja(SH_CITAS) || abrirHoja("TODOBIEN");
  if (!sheet || sheet.getLastRow()<=1) { Logger.log("Sin datos"); return; }
  sheet.getRange("H:H").setNumberFormat("@");
  var r = sheet.getRange(2,8,sheet.getLastRow()-1,1);
  var v = r.getValues(), d = r.getDisplayValues(), fixes = 0;
  var nuevos = v.map(function(row,i){
    var raw=row[0], dv=d[i][0].trim().replace(/^'/,"");
    if (typeof raw==="number"){ fixes++; var tm=Math.round(raw*24*60); return[zp(Math.floor(tm/60))+":"+zp(tm%60)]; }
    if (raw instanceof Date){   fixes++; return[zp(raw.getHours())+":"+zp(raw.getMinutes())]; }
    if (/^\d{1,2}:\d{2}/.test(dv)) return[dv.substring(0,5)];
    return[String(raw).trim().replace(/^'/,"")];
  });
  r.setValues(nuevos);
  Logger.log("Horas corregidas: " + fixes);
  actualizarAgenda();
}

// ═══════════════════════════════════════════════════════════════════════
//   INICIALIZADORES DE HOJAS
// ═══════════════════════════════════════════════════════════════════════
function crearHojaCitas(sheet) {
  var cols = ["N°","Fecha Registro","Nombre","Teléfono","DNI","Servicio",
              "Fecha Cita","Hora Cita","Comentario","Estado","Pago","Consentimiento","Doctor","Recibo","Confirmación"];
  sheet.appendRow(cols);
  sheet.getRange(1,1,1,15)
    .setBackground(P.azulOsc).setFontColor(P.blanco)
    .setFontWeight("bold").setFontSize(10).setVerticalAlignment("middle");
  sheet.setFrozenRows(1);
  sheet.getRange("H:H").setNumberFormat("@");
  [50,120,160,100,80,165,80,75,200,95,130,120,120,110,90].forEach(function(w,i){ sheet.setColumnWidth(i+1,w); });
  sheet.setRowHeight(1,28);
  var rule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  sheet.getRange("O:O").setDataValidation(rule).setValue(false);
  Logger.log("Hoja CITAS creada (15 columnas).");
}

function crearHojaHistoria(sheet) {
  sheet.setFrozenRows(2);
  sheet.getRange(1,1).setValue("HISTORIA CLÍNICA  —  CONSULTORIO DENTAL TODO BIEN  |  Dr. Luján")
    .setBackground(P.azulOsc).setFontColor(P.blanco)
    .setFontWeight("bold").setFontSize(13).setVerticalAlignment("middle");
  sheet.getRange(1,2,1,11).setBackground(P.azulOsc);
  sheet.setRowHeight(1,38);

  var cols = ["DNI","Nombre Completo","Teléfono","Primera Visita",
              "Motivo Primera Visita","Alergias","Enfermedades Previas",
              "Medicamentos","Observaciones","Último Tratamiento",
              "Estado Bucal","Estado Paciente"];
  sheet.getRange(2,1,1,12).setValues([cols])
    .setBackground(P.azul).setFontColor(P.blanco)
    .setFontWeight("bold").setFontSize(9).setVerticalAlignment("middle")
    .setHorizontalAlignment("center");
  sheet.setRowHeight(2,26);

  [80,185,100,90,160,130,165,165,220,165,120,110].forEach(function(w,i){ sheet.setColumnWidth(i+1,w); });

  sheet.getRange(3,1).setValue("Los pacientes se agregan automáticamente al reservar. Completa los datos médicos aquí. Ver pestaña ODONTOGRAMA para el diagrama dental.")
    .setFontColor(P.muted).setFontStyle("italic").setFontSize(8).setBackground(P.cream);
  sheet.getRange(3,2,1,11).setBackground(P.cream);
  sheet.setRowHeight(3,16);
  Logger.log("Hoja HISTORIA CLÍNICA creada.");
}

function crearHojaOdontograma(ss) {
  var old = ss.getSheetByName(SH_ODONTO);
  if (old) ss.deleteSheet(old);
  var sheet = ss.insertSheet(SH_ODONTO);
  var W = 45, H = 55;

  sheet.getRange(1,1,1,20).merge()
    .setValue("ODONTOGRAMA — CONSULTORIO DENTAL TODO BIEN  |  Dr. Luján")
    .setBackground(P.azulOsc).setFontColor(P.blanco)
    .setFontWeight("bold").setFontSize(12).setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.setRowHeight(1,36);

  sheet.getRange(2,1,1,20).merge()
    .setValue("Busca al paciente por DNI en la columna A. Haz click en la celda del diente y selecciona el estado del desplegable.")
    .setFontColor(P.muted).setFontSize(9).setFontStyle("italic")
    .setBackground(P.cream).setHorizontalAlignment("center");
  sheet.setRowHeight(2,18);

  var leyendas = [
    ["Sano","#dcfce7","#166534"],
    ["Caries","#fee2e2","#9b1c1c"],
    ["Obturado","#fef9c3","#92400e"],
    ["Corona","#dbeafe","#1e40af"],
    ["Extraccion","#f3e5f5","#6d28d9"],
    ["Implante","#e0f2fe","#0369a1"],
    ["Puente","#e8f0fb","#1a56c4"],
    ["Fractura","#fce4ec","#be185d"],
    ["En tratamiento","#fff3cd","#b45309"],
  ];
  var leyCol = 1;
  leyendas.forEach(function(l){
    sheet.getRange(3, leyCol).setValue(l[0])
      .setBackground(l[1]).setFontColor(l[2]).setFontWeight("bold")
      .setFontSize(8).setHorizontalAlignment("center").setVerticalAlignment("middle");
    leyCol++;
  });
  sheet.getRange(3, leyCol, 1, 20-leyCol+1).setBackground(P.cream);
  sheet.setRowHeight(3, 20);

  sheet.setColumnWidth(1, 130);
  sheet.setColumnWidth(2, 8);

  sheet.getRange(4,1).setValue("PACIENTE / DNI")
    .setBackground(P.sage).setFontColor(P.azulOsc)
    .setFontWeight("bold").setFontSize(8).setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.setRowHeight(4,28);

  sheet.getRange(4,3,1,8).merge()
    .setValue("◄  SUPERIOR DERECHO  (18 → 11)")
    .setBackground(P.azul).setFontColor(P.blanco)
    .setFontWeight("bold").setFontSize(8).setHorizontalAlignment("center");
  sheet.getRange(4,12,1,8).merge()
    .setValue("(21 → 28)  SUPERIOR IZQUIERDO  ►")
    .setBackground(P.azul2).setFontColor(P.blanco)
    .setFontWeight("bold").setFontSize(8).setHorizontalAlignment("center");

  var supD = [18,17,16,15,14,13,12,11];
  var supI = [21,22,23,24,25,26,27,28];
  sheet.getRange(5,1).setValue("Núm. diente →")
    .setFontColor(P.muted).setFontSize(7).setFontStyle("italic").setVerticalAlignment("middle");
  supD.forEach(function(d,i){
    sheet.getRange(5,3+i).setValue(d)
      .setBackground(P.mint).setFontColor(P.azul2)
      .setFontWeight("bold").setFontSize(10).setHorizontalAlignment("center").setVerticalAlignment("middle");
    sheet.setColumnWidth(3+i, W);
  });
  supI.forEach(function(d,i){
    sheet.getRange(5,12+i).setValue(d)
      .setBackground(P.mint).setFontColor(P.azul2)
      .setFontWeight("bold").setFontSize(10).setHorizontalAlignment("center").setVerticalAlignment("middle");
    sheet.setColumnWidth(12+i, W);
  });
  sheet.setRowHeight(5,22);

  sheet.getRange(6,1).setValue("1er paciente →")
    .setFontColor(P.muted).setFontSize(7).setFontStyle("italic").setVerticalAlignment("middle");
  for (var i=0; i<8; i++) {
    styleDiente(sheet.getRange(6,3+i), true);
    styleDiente(sheet.getRange(6,12+i), true);
  }
  sheet.setRowHeight(6, H);

  sheet.getRange(7,1,1,20).setBackground("#334155");
  sheet.setRowHeight(7, 4);
  sheet.getRange(7,1).setValue("── MAXILAR ──")
    .setFontColor(P.blanco).setFontSize(7).setHorizontalAlignment("center").setVerticalAlignment("middle");

  sheet.getRange(8,1).setValue("1er paciente →")
    .setFontColor(P.muted).setFontSize(7).setFontStyle("italic").setVerticalAlignment("middle");
  for (var i=0; i<8; i++) {
    styleDiente(sheet.getRange(8,3+i), false);
    styleDiente(sheet.getRange(8,12+i), false);
  }
  sheet.setRowHeight(8, H);

  sheet.getRange(9,1).setValue("Núm. diente →")
    .setFontColor(P.muted).setFontSize(7).setFontStyle("italic").setVerticalAlignment("middle");
  var infD = [48,47,46,45,44,43,42,41];
  var infI = [31,32,33,34,35,36,37,38];
  for (var i=0; i<8; i++) {
    sheet.getRange(9,3+i).setValue(infD[i])
      .setBackground(P.border).setFontColor(P.muted)
      .setFontWeight("bold").setFontSize(10).setHorizontalAlignment("center").setVerticalAlignment("middle");
  }
  for (var i=0; i<8; i++) {
    sheet.getRange(9,12+i).setValue(infI[i])
      .setBackground(P.border).setFontColor(P.muted)
      .setFontWeight("bold").setFontSize(10).setHorizontalAlignment("center").setVerticalAlignment("middle");
  }
  sheet.setRowHeight(9,22);

  sheet.getRange(10,3,1,8).merge()
    .setValue("◄  INFERIOR DERECHO  (48 → 41)")
    .setBackground(P.muted).setFontColor(P.blanco)
    .setFontWeight("bold").setFontSize(8).setHorizontalAlignment("center");
  sheet.getRange(10,12,1,8).merge()
    .setValue("(31 → 38)  INFERIOR IZQUIERDO  ►")
    .setBackground(P.azul).setFontColor(P.blanco)
    .setFontWeight("bold").setFontSize(8).setHorizontalAlignment("center");
  sheet.getRange(10,1).setValue("").setBackground(P.sage);
  sheet.setRowHeight(10,24);

  sheet.getRange(11,1,1,20).setBackground(P.border);
  sheet.setRowHeight(11, 6);

  sheet.getRange(12,1,1,20).merge()
    .setValue("Para agregar más pacientes: copia las filas 6-11 y pégalas abajo. Escribe el DNI del paciente en la columna A de la fila de dientes superiores.")
    .setFontColor(P.muted).setFontSize(8).setFontStyle("italic")
    .setBackground(P.gris).setHorizontalAlignment("center");
  sheet.setRowHeight(12,18);

  sheet.setFrozenRows(3);
  ss.setActiveSheet(sheet);
  ss.moveActiveSheet(2);
  Logger.log("Hoja ODONTOGRAMA visual creada.");
}

function styleDiente(cell, esSuperior) {
  cell.setBackground(esSuperior ? "#f0f9ff" : "#f8fffe")
    .setHorizontalAlignment("center").setVerticalAlignment("middle")
    .setFontSize(9).setFontWeight("bold")
    .setBorder(true,true,true,true,false,false,"#94a3b8",SpreadsheetApp.BorderStyle.SOLID);
  cell.setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(["","Sano","Caries","Obturado","Corona","Extraccion","Implante","Puente","Fractura","En tratamiento"],true)
      .setAllowInvalid(false).build()
  );
}

// ═══════════════════════════════════════════════════════════════════════
//   UTILIDADES
// ═══════════════════════════════════════════════════════════════════════
function getOrCreate(ss, nombre, initFn) {
  var s = ss.getSheetByName(nombre);
  if (!s) { s = ss.insertSheet(nombre); if (initFn) initFn(s); }
  return s;
}
function abrirHoja(nombre) {
  return SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(nombre);
}
function setDropdown(range, opciones) {
  range.setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(opciones, true).setAllowInvalid(false).build()
  );
}
function bloque(sheet, f, vals, ncols, bg, fg, size, bold, height) {
  var r = sheet.getRange(f,1,1,ncols);
  var v = vals.concat(new Array(ncols-vals.length).fill(""));
  r.setValues([v.slice(0,ncols)]);
  r.setBackground(bg).setFontColor(fg);
  if (size) r.setFontSize(size);
  if (bold) r.setFontWeight("bold");
  r.setVerticalAlignment("middle");
  if (height) sheet.setRowHeight(f,height);
}
function anchos(sheet) {
  [50,120,155,100,80,165,80,75,200,95,130,120,120,110,90].forEach(function(w,i){ sheet.setColumnWidth(i+1,w); });
}
function hMin(h) {
  var p = String(h).split(":");
  return parseInt(p[0],10)*60 + parseInt(p[1]||0,10);
}
function hMinFlex(s) {
  s = s.trim();
  var m24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) return parseInt(m24[1],10)*60+parseInt(m24[2],10);
  var m12 = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m12) {
    var h=parseInt(m12[1],10),mn=parseInt(m12[2],10),ap=m12[3].toUpperCase();
    if(ap==="AM"&&h===12)h=0; if(ap==="PM"&&h!==12)h+=12;
    return h*60+mn;
  }
  return -1;
}
function mStr(m) { return zp(Math.floor(m/60))+":"+zp(m%60); }
function zp(n)   { return String(n).padStart(2,"0"); }
function fmt12(h24) {
  var p = h24.split(":").map(function(x){ return parseInt(x,10); });
  if (isNaN(p[0])) return h24;
  return (p[0]%12||12)+":"+zp(p[1]||0)+(p[0]>=12?" PM":" AM");
}
function lighten(hex) {
  try {
    var r=Math.min(255,parseInt(hex.slice(1,3),16)+15);
    var g=Math.min(255,parseInt(hex.slice(3,5),16)+15);
    var b=Math.min(255,parseInt(hex.slice(5,7),16)+15);
    return "#"+r.toString(16).padStart(2,"0")+g.toString(16).padStart(2,"0")+b.toString(16).padStart(2,"0");
  } catch(e){ return hex; }
}
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/*
══════════════════════════════════════════════════════════════════
  GUÍA DE USO — TODO BIEN v13
══════════════════════════════════════════════════════════

  PRIMERA VEZ:
  1. Ejecuta  borrarTodosLosPacientes  →  limpia datos de prueba
  2. Ejecuta  crearPlantillaRecibo     →  crea plantilla en Drive
             Abre  Ver → Registros  y copia el ID
             Pégalo en  PLANTILLA_DOC_ID = "..."  (línea 7)
             Guarda con Ctrl+S
  3. Ejecuta  setupCompleto            →  crea las 4 pestañas (ahora con columna Confirmación)
  4. Ejecuta  instalarTrigger          →  activa recibo automático
  5. Implementar → Nueva implementación
             Tipo: Aplicación web
             Ejecutar como: Yo
             Acceso: Cualquier persona
             Copia la URL al HTML

  NUEVO:
  · La pestaña CITAS ahora tiene una columna "Doctor" antes de Recibo
  · Acción getCitas devuelve doctor
  · Acción save guarda doctor
  · Todas las funciones que leen la hoja CITAS ahora trabajan con 15 columnas

══════════════════════════════════════════════════
*/
