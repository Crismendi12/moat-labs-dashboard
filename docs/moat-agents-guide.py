#!/usr/bin/env python3
"""MOAT Labs Command Center -- Agent Architecture Guide (PDF)"""

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch, mm
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, HRFlowable
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os

OUTPUT = os.path.join(os.path.dirname(__file__), "MOAT_Labs_Agent_Architecture.pdf")

# Colors
NAVY = HexColor("#0D0D0D")
PRIMARY = HexColor("#2B4B8C")
ACCENT = HexColor("#D4A149")
ORANGE = HexColor("#F97316")
RED = HexColor("#DC2626")
GREEN = HexColor("#16A34A")
PURPLE = HexColor("#7C3AED")
GRAY = HexColor("#666666")
LIGHT_GRAY = HexColor("#F5F5F5")
BORDER = HexColor("#E0E0E0")
DARK_BG = HexColor("#1A1B23")
CARD_BG = HexColor("#F8F9FA")

# Styles
STYLES = {
    "title": ParagraphStyle("title", fontSize=28, leading=34, textColor=NAVY, fontName="Helvetica-Bold", spaceAfter=4),
    "subtitle": ParagraphStyle("subtitle", fontSize=13, leading=18, textColor=GRAY, fontName="Helvetica", spaceAfter=20),
    "h1": ParagraphStyle("h1", fontSize=20, leading=26, textColor=PRIMARY, fontName="Helvetica-Bold", spaceBefore=24, spaceAfter=12),
    "h2": ParagraphStyle("h2", fontSize=15, leading=20, textColor=NAVY, fontName="Helvetica-Bold", spaceBefore=18, spaceAfter=8),
    "h3": ParagraphStyle("h3", fontSize=12, leading=16, textColor=PRIMARY, fontName="Helvetica-Bold", spaceBefore=12, spaceAfter=6),
    "body": ParagraphStyle("body", fontSize=10, leading=15, textColor=HexColor("#333333"), fontName="Helvetica", spaceAfter=6),
    "small": ParagraphStyle("small", fontSize=9, leading=13, textColor=GRAY, fontName="Helvetica", spaceAfter=4),
    "caption": ParagraphStyle("caption", fontSize=8, leading=11, textColor=GRAY, fontName="Helvetica-Oblique", spaceAfter=8),
    "badge": ParagraphStyle("badge", fontSize=9, leading=12, textColor=white, fontName="Helvetica-Bold"),
    "agent_name": ParagraphStyle("agent_name", fontSize=11, leading=15, textColor=NAVY, fontName="Helvetica-Bold", spaceAfter=2),
    "agent_id": ParagraphStyle("agent_id", fontSize=8, leading=11, textColor=GRAY, fontName="Helvetica"),
    "bullet": ParagraphStyle("bullet", fontSize=10, leading=15, textColor=HexColor("#333333"), fontName="Helvetica", leftIndent=16, spaceAfter=3, bulletIndent=6),
    "flow_step": ParagraphStyle("flow_step", fontSize=9, leading=13, textColor=HexColor("#333333"), fontName="Helvetica", spaceAfter=2),
    "toc_item": ParagraphStyle("toc_item", fontSize=11, leading=18, textColor=PRIMARY, fontName="Helvetica", leftIndent=20),
    "footer": ParagraphStyle("footer", fontSize=7, leading=10, textColor=GRAY, fontName="Helvetica", alignment=TA_CENTER),
}


def header_bar(text, color=PRIMARY):
    t = Table(
        [[Paragraph(f"<b>{text}</b>", ParagraphStyle("hdr", fontSize=12, leading=16, textColor=white, fontName="Helvetica-Bold"))]],
        colWidths=[7.1 * inch],
        rowHeights=[30],
    )
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), color),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("ROUNDEDCORNERS", [6, 6, 6, 6]),
    ]))
    return t


def agent_card(name, scenario_id, trigger, description, steps, highlight_color=PRIMARY):
    elements = []
    # Header row
    hdr_data = [[
        Paragraph(f"<b>{name}</b>", ParagraphStyle("an", fontSize=11, leading=14, textColor=white, fontName="Helvetica-Bold")),
        Paragraph(f"ID: {scenario_id}  |  {trigger}", ParagraphStyle("ai", fontSize=8, leading=11, textColor=HexColor("#BBBBBB"), fontName="Helvetica")),
    ]]
    hdr = Table(hdr_data, colWidths=[3.5 * inch, 3.5 * inch])
    hdr.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), highlight_color),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (0, 0), 12),
        ("RIGHTPADDING", (1, 0), (1, 0), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
    ]))

    # Body
    body_parts = []
    body_parts.append([Paragraph(description, STYLES["body"])])
    if steps:
        flow_text = "  -->  ".join(steps)
        body_parts.append([Paragraph(f'<font color="#2B4B8C"><b>Flujo:</b></font>  {flow_text}', STYLES["small"])])

    body = Table(body_parts, colWidths=[6.85 * inch])
    body.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CARD_BG),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (0, 0), 10),
        ("BOTTOMPADDING", (-1, -1), (-1, -1), 10),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))

    # Combine
    wrapper = Table([[hdr], [body]], colWidths=[7.1 * inch])
    wrapper.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 1, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return KeepTogether([wrapper, Spacer(1, 10)])


def info_table(data, col_widths=None, header=True):
    if not col_widths:
        col_widths = [7.1 * inch / len(data[0])] * len(data[0])
    styled_data = []
    for i, row in enumerate(data):
        styled_row = []
        for cell in row:
            if i == 0 and header:
                styled_row.append(Paragraph(f"<b>{cell}</b>", ParagraphStyle("th", fontSize=9, leading=12, textColor=white, fontName="Helvetica-Bold")))
            else:
                styled_row.append(Paragraph(str(cell), ParagraphStyle("td", fontSize=9, leading=13, textColor=HexColor("#333"), fontName="Helvetica")))
        styled_data.append(styled_row)

    t = Table(styled_data, colWidths=col_widths)
    style_cmds = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
    ]
    if header:
        style_cmds.append(("BACKGROUND", (0, 0), (-1, 0), PRIMARY))
    for i in range(1, len(styled_data)):
        if i % 2 == 0:
            style_cmds.append(("BACKGROUND", (0, i), (-1, i), HexColor("#F9FAFB")))
    t.setStyle(TableStyle(style_cmds))
    return t


def flow_diagram(steps_with_labels):
    """Create a visual flow with arrows."""
    cells = []
    for i, (step, sublabel) in enumerate(steps_with_labels):
        cells.append(Paragraph(
            f'<font color="#2B4B8C"><b>{step}</b></font><br/><font size="7" color="#888">{sublabel}</font>',
            ParagraphStyle("fc", fontSize=9, leading=12, alignment=TA_CENTER, fontName="Helvetica")
        ))
        if i < len(steps_with_labels) - 1:
            cells.append(Paragraph('<font color="#D4A149" size="14"><b>--></b></font>', ParagraphStyle("arrow", fontSize=14, alignment=TA_CENTER, leading=18)))

    n = len(cells)
    widths = []
    for i in range(n):
        widths.append(1.1 * inch if i % 2 == 0 else 0.4 * inch)
    total = sum(widths)
    if total > 7.1 * inch:
        scale = 7.1 * inch / total
        widths = [w * scale for w in widths]

    t = Table([cells], colWidths=widths, rowHeights=[42])
    style_cmds = [("VALIGN", (0, 0), (-1, -1), "MIDDLE")]
    for i in range(0, n, 2):
        style_cmds.append(("BACKGROUND", (i, 0), (i, 0), HexColor("#EEF2FF")))
        style_cmds.append(("BOX", (i, 0), (i, 0), 0.5, HexColor("#C7D2FE")))
    t.setStyle(TableStyle(style_cmds))
    return t


def dual_card(left_title, left_items, left_color, right_title, right_items, right_color):
    left_content = f'<font color="{left_color}"><b>{left_title}</b></font><br/>'
    for item in left_items:
        left_content += f'<br/><font size="9">{item}</font>'
    right_content = f'<font color="{right_color}"><b>{right_title}</b></font><br/>'
    for item in right_items:
        right_content += f'<br/><font size="9">{item}</font>'

    ls = ParagraphStyle("lc", fontSize=10, leading=14, textColor=HexColor("#333"), fontName="Helvetica")
    t = Table(
        [[Paragraph(left_content, ls), Paragraph(right_content, ls)]],
        colWidths=[3.45 * inch, 3.45 * inch]
    )
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOX", (0, 0), (0, 0), 1, HexColor(left_color)),
        ("BOX", (1, 0), (1, 0), 1, HexColor(right_color)),
        ("BACKGROUND", (0, 0), (0, 0), HexColor("#FAF5FF")),
        ("BACKGROUND", (1, 0), (1, 0), HexColor("#EFF6FF")),
        ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ("TOPPADDING", (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
    ]))
    return t


def build_pdf():
    doc = SimpleDocTemplate(
        OUTPUT, pagesize=letter,
        leftMargin=0.65 * inch, rightMargin=0.65 * inch,
        topMargin=0.6 * inch, bottomMargin=0.6 * inch,
    )
    story = []

    # === COVER ===
    story.append(Spacer(1, 1.5 * inch))
    # Logo bar
    logo_bar = Table(
        [[Paragraph('<b>MOAT</b> LABS', ParagraphStyle("logo", fontSize=32, leading=38, textColor=white, fontName="Helvetica-Bold"))]],
        colWidths=[7.1 * inch], rowHeights=[56]
    )
    logo_bar.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), NAVY),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 24),
        ("ROUNDEDCORNERS", [8, 8, 0, 0]),
    ]))
    accent_bar = Table([[""]], colWidths=[7.1 * inch], rowHeights=[4])
    accent_bar.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), ACCENT)]))
    story.append(logo_bar)
    story.append(accent_bar)
    story.append(Spacer(1, 30))

    story.append(Paragraph("Command Center", STYLES["title"]))
    story.append(Paragraph("Arquitectura de Agentes y Automatizaciones", ParagraphStyle("st2", fontSize=16, leading=22, textColor=PRIMARY, fontName="Helvetica")))
    story.append(Spacer(1, 20))
    story.append(HRFlowable(width="100%", thickness=1, color=BORDER))
    story.append(Spacer(1, 14))

    cover_info = [
        ["Documento", "Guia de Arquitectura -- Equipo MOAT Labs"],
        ["Version", "3.0 -- Marzo 2026"],
        ["Agentes activos", "14 escenarios Make.com"],
        ["Dashboard", "moat-labs-dashboard.vercel.app"],
        ["Costo operativo", "~$11 USD/mes"],
    ]
    for label, value in cover_info:
        story.append(Paragraph(f'<b>{label}:</b>  {value}', ParagraphStyle("ci", fontSize=11, leading=18, textColor=HexColor("#444"), fontName="Helvetica")))
    story.append(Spacer(1, 30))

    # TOC
    story.append(Paragraph("<b>Contenido</b>", STYLES["h2"]))
    toc_items = [
        "1. Vision General del Sistema",
        "2. Capa 1 -- Agentes de Inteligencia",
        "3. Capa 2 -- Motor de Segmentacion (6 Playbooks)",
        "4. Capa 3 -- Agentes de Generacion",
        "5. Capa 4 -- Agente de Calidad (Quality Gate)",
        "6. Capa 5 -- Agentes de Ejecucion",
        "7. Capa 6 -- Agentes de Monitoreo",
        "8. Capa 7 -- Agentes de Soporte",
        "9. Flujo Completo: De Lead a Deal",
        "10. Manual vs Auto: Diferenciacion de Leads",
        "11. Proteccion de Dominio",
        "12. Horario de Agentes",
        "13. Stack Tecnologico y Costos",
    ]
    for item in toc_items:
        story.append(Paragraph(item, STYLES["toc_item"]))

    story.append(PageBreak())

    # === 1. VISION GENERAL ===
    story.append(header_bar("1. VISION GENERAL DEL SISTEMA"))
    story.append(Spacer(1, 12))
    story.append(Paragraph(
        "El MOAT Labs Command Center es un sistema de operaciones de ventas construido sobre 4 tecnologias: "
        "un dashboard en HTML/CSS/JS (Vercel), Google Sheets como base de datos, Make.com como motor de automatizacion, "
        "y OpenAI GPT-4o-mini como capa de inteligencia. El sistema opera a traves de <b>14 agentes autonomos</b> "
        "organizados en 7 capas funcionales.",
        STYLES["body"]
    ))
    story.append(Spacer(1, 10))

    # Architecture overview table
    arch_data = [
        ["Capa", "Funcion", "Agentes", "Tipo"],
        ["1. Inteligencia", "Encontrar oportunidades", "Auto Prospecting, Bulk Insert", "Scheduled + Webhook"],
        ["2. Segmentacion", "Decidir la estrategia", "Motor de 6 Playbooks", "Dashboard (JS)"],
        ["3. Generacion", "Crear contenido", "Outbound Generate, Follow-up, Intel", "Webhook + Scheduled"],
        ["4. Calidad", "Revisar antes de enviar", "Quality Review Agent", "Webhook"],
        ["5. Ejecucion", "Enviar y actualizar", "Outbound Send, Lead to Pipeline", "Webhook"],
        ["6. Monitoreo", "Observar y reportar", "Gmail Scanner, Morning Brief, Weekly Report, GA4", "Scheduled"],
        ["7. Soporte", "Mantenimiento", "Image Upload, Image Cleanup", "Webhook + Scheduled"],
    ]
    story.append(info_table(arch_data, [1.1*inch, 1.6*inch, 2.2*inch, 1.5*inch]))
    story.append(Spacer(1, 14))

    story.append(Paragraph(
        '<b>Flujo macro del CEO:</b> Morning Brief (7AM) --> Abrir Dashboard --> Quick Bar muestra urgencias --> '
        'Revisar emails generados --> Aprobar y enviar --> Respuestas detectadas automaticamente --> '
        'Deal creado en Pipeline --> Weekly Report (lunes)',
        ParagraphStyle("macro", fontSize=10, leading=15, textColor=PRIMARY, fontName="Helvetica", borderColor=PRIMARY,
                       borderWidth=1, borderPadding=10, backColor=HexColor("#EEF2FF"))
    ))

    story.append(PageBreak())

    # === 2. CAPA 1: INTELIGENCIA ===
    story.append(header_bar("2. CAPA 1 -- AGENTES DE INTELIGENCIA", HexColor("#1E40AF")))
    story.append(Spacer(1, 8))
    story.append(Paragraph("Encuentran oportunidades de negocio automaticamente, sin intervencion humana.", STYLES["body"]))
    story.append(Spacer(1, 8))

    story.append(agent_card(
        "Auto Prospecting Weekly",
        "4482536", "Domingo 7:00 AM UTC",
        "Busca noticias de AI, startups y tecnologia en LATAM y globalmente usando Google News RSS. "
        "OpenAI analiza las noticias y genera resumenes de leads potenciales con contexto de por que son relevantes para MOAT Labs. "
        "Escribe resultados en la tab 'Prospecting' del Sheet.",
        ["RSS Global AI", "Aggregator", "RSS LATAM AI", "Aggregator", "OpenAI", "Google Sheets"],
        HexColor("#1E40AF")
    ))

    story.append(agent_card(
        "Bulk Lead Inserter",
        "4482358", "Webhook (on demand)",
        "Recibe listas de leads desde fuentes externas (Vibe Prospecting, LinkedIn exports, etc.) y los inserta "
        "automaticamente en la tab 'Outbound' del Sheet. Cada lead incluye: empresa, contacto, email, industria, pais, score.",
        ["Webhook POST", "Google Sheets: Add Row"],
        HexColor("#1E40AF")
    ))

    story.append(PageBreak())

    # === 3. CAPA 2: SEGMENTACION ===
    story.append(header_bar("3. CAPA 2 -- MOTOR DE SEGMENTACION", HexColor("#7C3AED")))
    story.append(Spacer(1, 8))
    story.append(Paragraph(
        "Ocurre en el dashboard (JavaScript). Cada lead se analiza automaticamente basado en 4 variables: "
        "<b>Source</b>, <b>Industry</b>, <b>Country</b> y <b>Contact name</b>. El resultado es uno de 6 playbooks que define "
        "el tono, angulo y estrategia del email.",
        STYLES["body"]
    ))
    story.append(Spacer(1, 8))

    # Detection flow
    story.append(Paragraph("<b>Logica de deteccion (detectSegment):</b>", STYLES["h3"]))
    detect_data = [
        ["Condicion", "Segmento", "Playbook"],
        ["LATAM + VC keywords", "vcs_latam", "Portfolio value-add: pitch MOAT para sus portcos"],
        ["LATAM + Founder keywords", "founders_latam", "Cliente directo: MOAT diagnostic $5K-$10K"],
        ["LATAM + otro", "warm_latam", "Nurture: relacion primero, sin venta directa"],
        ["Global + VC keywords", "vcs_global", "LATAM bridge: inteligencia competitiva regional"],
        ["Global + Founder keywords", "founders_global", "LATAM expansion: framework MOAT global"],
        ["No match", "default", "Pitch generico: MOAT Score diagnostic"],
    ]
    story.append(info_table(detect_data, [1.8*inch, 1.4*inch, 3.6*inch]))
    story.append(Spacer(1, 10))

    story.append(Paragraph(
        "<b>Cada playbook incluye automaticamente:</b>", STYLES["h3"]
    ))
    for item in [
        "Instrucciones de tono y angulo especificas para el segmento",
        "P.S. con link de discovery call: calendar.app.google/QLhJS3bpbAJfreNXA (excepto warm_latam)",
        "Firma profesional: Cristian Mendivelso | MOAT Labs | moatlabs-ventures.com",
        "Referencia a contenido reciente de LinkedIn como social proof (si aplica)",
    ]:
        story.append(Paragraph(f"<bullet>&bull;</bullet>{item}", STYLES["bullet"]))

    story.append(PageBreak())

    # === 4. CAPA 3: GENERACION ===
    story.append(header_bar("4. CAPA 3 -- AGENTES DE GENERACION", HexColor("#059669")))
    story.append(Spacer(1, 8))
    story.append(Paragraph("Crean emails y contenido personalizado usando inteligencia artificial.", STYLES["body"]))
    story.append(Spacer(1, 8))

    story.append(agent_card(
        "Outbound Generate",
        "4481670", "Webhook (click 'Generate' en dashboard)",
        "El agente principal de creacion de emails. Recibe la empresa, contacto, industria y el playbook del segmento. "
        "Busca noticias recientes sobre la empresa via Google News RSS para personalizar. "
        "OpenAI escribe un email de 120 palabras max con subject line de 8 palabras max, referencia a noticia real, "
        "y P.S. con link de calendario. Tiempo de respuesta: 15-30 segundos.",
        ["Webhook", "RSS News", "TextAggregator", "OpenAI GPT-4o-mini", "Response"],
        HexColor("#059669")
    ))

    story.append(agent_card(
        "Auto Follow-up Generator",
        "4486869", "Diario 8:00 AM COT",
        "Revisa todos los leads auto que tienen SeqStep y LastSent. Si pasaron 3+ dias desde Touch 1, genera un Follow-up "
        "(angulo diferente, subject con 'Re:'). Si pasaron 5+ dias desde Touch 2, genera un Break-up (cierre elegante, escasez suave). "
        "<b>Escribe en el Sheet pero NO envia</b> -- el humano revisa y aprueba. Leads manuales se ignoran completamente.",
        ["Sheets GET Outbound", "JSON Parse", "OpenAI", "Sheets batchUpdate"],
        HexColor("#059669")
    ))

    story.append(agent_card(
        "Intel Brief",
        "4481549", "Webhook (click 'Intel' en dashboard)",
        "Genera inteligencia competitiva por deal. Analiza la empresa, su mercado, competidores y tendencias. "
        "Devuelve un brief estrategico con angulos para la reunion. Util para preparacion pre-meeting.",
        ["Webhook", "OpenAI", "Response HTML"],
        HexColor("#059669")
    ))

    story.append(PageBreak())

    # === 5. CAPA 4: CALIDAD ===
    story.append(header_bar("5. CAPA 4 -- AGENTE DE CALIDAD (QUALITY GATE)", RED))
    story.append(Spacer(1, 8))
    story.append(Paragraph(
        "El agente mas critico del sistema. Implementa el patron <b>Generator-Critic</b>: un agente escribe (Generate), "
        "otro agente distinto critica (Quality Review). Nunca se auto-evaluan. Esto asegura que ningun email o post "
        "sale sin revision de calidad.",
        STYLES["body"]
    ))
    story.append(Spacer(1, 8))

    story.append(agent_card(
        "Quality Review Agent",
        "4486756", "Webhook (automatico despues de Generate)",
        "Recibe cualquier email o post de LinkedIn y lo evalua como critico. "
        "Devuelve un score 0-100, veredicto (approve/revise/reject), nivel de spam risk, "
        "nivel de personalizacion, lista de issues y sugerencias de mejora.",
        ["Webhook con contenido", "OpenAI (prompt de critica)", "Response JSON"],
        RED
    ))
    story.append(Spacer(1, 6))

    # Quality gate rules
    story.append(Paragraph("<b>Reglas del Quality Gate:</b>", STYLES["h3"]))
    gate_data = [
        ["Score", "Veredicto", "Accion en Dashboard"],
        ["80-100", "APPROVE (verde)", "Boton Send habilitado. Listo para enviar."],
        ["60-79", "REVISE (amarillo)", "Boton Send habilitado con advertencia. Se sugiere editar."],
        ["0-59", "REJECT (rojo)", "Boton Send BLOQUEADO. Debe editar y re-revisar antes de enviar."],
    ]
    story.append(info_table(gate_data, [1.2*inch, 2*inch, 3.6*inch]))
    story.append(Spacer(1, 8))

    story.append(Paragraph(
        "Ademas evalua: <b>spam_risk</b> (low/medium/high), <b>personalization</b> (generic/moderate/strong), "
        "y genera <b>issues</b> especificos (ej. 'subject line demasiado generica') con <b>suggestions</b> concretas.",
        STYLES["small"]
    ))

    story.append(PageBreak())

    # === 6. CAPA 5: EJECUCION ===
    story.append(header_bar("6. CAPA 5 -- AGENTES DE EJECUCION", ORANGE))
    story.append(Spacer(1, 8))
    story.append(Paragraph("Envian emails y crean registros. Son los agentes que ejecutan acciones reales.", STYLES["body"]))
    story.append(Spacer(1, 8))

    story.append(agent_card(
        "Outbound Send",
        "4481672", "Webhook (click 'Send' en dashboard)",
        "Envia el email aprobado via Gmail de Cristian. Actualiza 3 columnas en el Sheet: "
        "Status (contactado), SeqStep (1/2/3 segun el touch), y LastSent (fecha de hoy). "
        "El dashboard impone un limite de 15 emails por dia para proteger la reputacion del dominio.",
        ["Webhook", "Gmail: Send Email", "Sheets: Update Status + SeqStep + LastSent"],
        ORANGE
    ))

    story.append(agent_card(
        "Lead to Pipeline",
        "4487489", "Webhook (modal en dashboard)",
        "Cuando un lead de outbound avanza a 'reunion', el dashboard muestra un modal preguntando el valor estimado del deal. "
        "Al confirmar, este agente crea automaticamente un row en la tab Pipeline del Sheet con: nombre, empresa, email, "
        "industria, pais, valor, etapa ('1st Meeting'), y fecha. Elimina la doble entrada de datos.",
        ["Webhook", "Google Sheets: Add Row to Pipeline"],
        ORANGE
    ))

    story.append(PageBreak())

    # === 7. CAPA 6: MONITOREO ===
    story.append(header_bar("7. CAPA 6 -- AGENTES DE MONITOREO", HexColor("#6D28D9")))
    story.append(Spacer(1, 8))
    story.append(Paragraph("Observan el entorno, detectan eventos y generan reportes. Corren automaticamente.", STYLES["body"]))
    story.append(Spacer(1, 8))

    story.append(agent_card(
        "Gmail Response Scanner",
        "4486974", "Diario 9:00 AM COT",
        "Escanea el inbox de Gmail buscando respuestas a emails de outbound (filtro: in:inbox newer_than:2d -from:me). "
        "Agrega todos los emails encontrados, lee la lista de leads de Outbound, y usa OpenAI para cruzar: "
        "'este email parece ser respuesta a este lead?' Si hay match, actualiza el Status a 'respondio'. "
        "El dashboard muestra un badge rojo inmediatamente en la Quick Bar.",
        ["Gmail Trigger", "TextAggregator", "Sheets GET", "JSON", "OpenAI Cross-ref", "Sheets batchUpdate"],
        HexColor("#6D28D9")
    ))

    story.append(agent_card(
        "CEO Morning Brief",
        "4487522", "Diario 7:00 AM COT",
        "Lee los 3 sheets principales (Pipeline, Outbound, Contabilidad) via la API de Google Sheets. "
        "OpenAI genera un resumen ejecutivo: revenue vs $100K target, acciones urgentes de hoy, "
        "salud del pipeline, pulso de outbound, y la prioridad #1 del dia. "
        "Formato HTML limpio, legible en 30 segundos en telefono. Incluye link al dashboard.",
        ["Sheets API x3", "JSON x3", "OpenAI Editorial", "Gmail Send"],
        HexColor("#6D28D9")
    ))

    story.append(agent_card(
        "Weekly Performance Report",
        "4487158", "Lunes 7:00 AM COT",
        "Resumen semanal completo: revenue vs $100K, estado del pipeline, estadisticas de outbound "
        "(enviados, response rate, meetings), y 3 recomendaciones accionables generadas por OpenAI.",
        ["Sheets x3", "OpenAI", "Gmail: HTML Report"],
        HexColor("#6D28D9")
    ))

    story.append(agent_card(
        "GA4 Web Analytics Sync",
        "4485921", "Domingo 7:00 AM UTC",
        "Conecta con Google Analytics 4 (property 510766684, moatlabs-ventures.com). "
        "Trae datos de fuentes de trafico y paginas mas visitadas via la Data API. "
        "Guarda como JSON en la tab Analytics del Sheet para que el dashboard los visualice.",
        ["GA4 API: Sources", "JSON", "GA4 API: Pages", "JSON", "Sheets: Add Row"],
        HexColor("#6D28D9")
    ))

    story.append(PageBreak())

    # === 8. CAPA 7: SOPORTE ===
    story.append(header_bar("8. CAPA 7 -- AGENTES DE SOPORTE", GRAY))
    story.append(Spacer(1, 8))

    story.append(agent_card(
        "Image Upload",
        "4481443", "Webhook (on demand)",
        "Sube imagenes a Google Drive para usar en posts del content calendar. Devuelve URL publica.",
        ["Webhook", "Google Drive: Upload", "Response: URL"],
        GRAY
    ))

    story.append(agent_card(
        "Image Cleanup",
        "4481444", "Diario (scheduled)",
        "Borra archivos con prefijo 'moat-img-' que tienen mas de 5 dias en Google Drive. Limpieza automatica.",
        ["Drive: List Files", "Filter >5d", "Drive: Delete"],
        GRAY
    ))

    story.append(PageBreak())

    # === 9. FLUJO COMPLETO ===
    story.append(header_bar("9. FLUJO COMPLETO: DE LEAD A DEAL", NAVY))
    story.append(Spacer(1, 12))
    story.append(Paragraph("<b>La secuencia de 3 toques -- paso a paso:</b>", STYLES["h2"]))
    story.append(Spacer(1, 8))

    steps = [
        ("DIA 0", "Lead entra", "Via Bulk Insert, Prospecting, o manual"),
        ("AUTO", "Segmentacion", "Dashboard detecta segmento y asigna playbook"),
        ("CLICK", "Generate", "Agente escribe email con playbook + noticias"),
        ("AUTO", "Quality Review", "Score 0-100, approve/revise/reject"),
        ("CLICK", "Send (Touch 1)", "Gmail envia, SeqStep=1, LastSent=hoy"),
        ("DIA 3+", "Follow-up auto", "Agente genera Touch 2, nuevo angulo"),
        ("CLICK", "Revisar + Send", "Humano aprueba, SeqStep=2"),
        ("DIA 8+", "Break-up auto", "Agente genera Touch 3, cierre elegante"),
        ("CLICK", "Revisar + Send", "Humano aprueba, SeqStep=3 (fin)"),
    ]

    flow_data = [["Paso", "Accion", "Detalle"]]
    for step, action, detail in steps:
        flow_data.append([step, action, detail])
    story.append(info_table(flow_data, [1*inch, 1.8*inch, 4*inch]))
    story.append(Spacer(1, 12))

    story.append(Paragraph("<b>Si el lead responde en cualquier momento:</b>", STYLES["h3"]))
    resp_steps = [
        ["Evento", "Agente", "Resultado"],
        ["Lead responde email", "Gmail Response Scanner (9AM)", "Status --> 'respondio'"],
        ["Dashboard muestra alerta", "Quick Bar badge rojo", "CEO ve 'Responses (1)'"],
        ["CEO responde manualmente", "N/A (humano)", "Conversacion directa"],
        ["CEO avanza a 'reunion'", "Lead to Pipeline", "Deal creado en Pipeline sheet"],
        ["Pipeline actualizado", "Dashboard funnel", "Deal visible en Closing/Win"],
    ]
    story.append(info_table(resp_steps, [1.8*inch, 2.2*inch, 2.8*inch]))

    story.append(PageBreak())

    # === 10. MANUAL vs AUTO ===
    story.append(header_bar("10. MANUAL vs AUTO: DIFERENCIACION DE LEADS", PURPLE))
    story.append(Spacer(1, 12))
    story.append(Paragraph(
        "La diferenciacion mas importante del sistema. Los leads manuales son relaciones personales "
        "que <b>nunca deben parecer automatizadas</b>. Los leads auto son volumen escalable con calidad controlada.",
        STYLES["body"]
    ))
    story.append(Spacer(1, 10))

    story.append(dual_card(
        "LEAD MANUAL", [
            "<b>Source:</b> manual / personal / referido",
            "<b>Badge:</b> MORADO",
            "<b>Boton:</b> 'Compose' (formulario vacio)",
            "<b>Secuencia 3 toques:</b> NO",
            "<b>Follow-up automatico:</b> NO",
            "<b>Quality gate:</b> NO",
            "<b>Playbook:</b> NO",
            "",
            "<b>Cristian escribe TODO</b> y maneja",
            "el timing personalmente.",
            "",
            "<i>Para: relaciones personales que no</i>",
            "<i>pueden parecer automatizadas.</i>",
        ], "#7C3AED",
        "LEAD AUTO", [
            "<b>Source:</b> auto / bulk / prospecting / vacio",
            "<b>Badge:</b> AZUL",
            "<b>Boton:</b> 'Generate' (IA escribe)",
            "<b>Secuencia 3 toques:</b> SI",
            "<b>Follow-up automatico:</b> SI (3d + 5d)",
            "<b>Quality gate:</b> SI (score >= 70)",
            "<b>Playbook:</b> SI (segun segmento)",
            "",
            "<b>IA escribe, Cristian revisa</b>",
            "y aprueba antes de enviar.",
            "",
            "<i>Para: volumen escalable con calidad</i>",
            "<i>controlada por agente de calidad.</i>",
        ], "#2B4B8C"
    ))
    story.append(Spacer(1, 10))
    story.append(Paragraph(
        "<b>Toggle:</b> Cada lead tiene un boton 'Switch to Manual' / 'Switch to Auto' para cambiar la clasificacion en cualquier momento.",
        STYLES["small"]
    ))

    story.append(PageBreak())

    # === 11. PROTECCION DE DOMINIO ===
    story.append(header_bar("11. PROTECCION DE DOMINIO", RED))
    story.append(Spacer(1, 12))

    domain_data = [
        ["", "Dashboard (Warm)", "Instantly (Cold)"],
        ["Operador", "Cristian", "Catalina"],
        ["Dominio", "@mahway.com (principal)", "Dominio separado"],
        ["Limite diario", "15 emails/dia", "Configurado en Instantly"],
        ["Tipo", "Warm + segmentado + personalizado", "Cold + masivo"],
        ["Quality gate", "SI (score 0-100)", "Instantly interno"],
        ["Seguimiento", "Dashboard MOAT", "Plataforma Instantly"],
    ]
    story.append(info_table(domain_data, [1.4*inch, 2.8*inch, 2.6*inch]))
    story.append(Spacer(1, 10))

    story.append(Paragraph(
        "<b>REGLA FUNDAMENTAL:</b> Nunca se mezclan. El dominio principal esta protegido. "
        "El dashboard trackea envios diarios en localStorage y bloquea el boton Send cuando se llega al limite de 15. "
        "Si quedan 3 o menos envios, muestra advertencia de confirmacion.",
        ParagraphStyle("warn", fontSize=10, leading=15, textColor=RED, fontName="Helvetica-Bold",
                       borderColor=RED, borderWidth=1, borderPadding=10, backColor=HexColor("#FEF2F2"))
    ))

    story.append(Spacer(1, 20))

    # === 12. HORARIO ===
    story.append(header_bar("12. HORARIO DE AGENTES AUTOMATICOS"))
    story.append(Spacer(1, 12))

    story.append(Paragraph("<b>Diarios:</b>", STYLES["h3"]))
    daily_data = [
        ["Hora (COT)", "Agente", "Que hace"],
        ["07:00 AM", "CEO Morning Brief", "Email con resumen del dia: revenue, urgencias, pipeline, prioridad #1"],
        ["08:00 AM", "Auto Follow-up Generator", "Genera Touch 2/3 para leads que cumplen timing (3d/5d)"],
        ["09:00 AM", "Gmail Response Scanner", "Detecta respuestas y marca leads como 'respondio'"],
        ["Automatico", "Image Cleanup", "Borra imagenes temporales >5 dias de Google Drive"],
    ]
    story.append(info_table(daily_data, [1.1*inch, 2.2*inch, 3.5*inch]))
    story.append(Spacer(1, 10))

    story.append(Paragraph("<b>Semanales:</b>", STYLES["h3"]))
    weekly_data = [
        ["Dia / Hora", "Agente", "Que hace"],
        ["Domingo 02:00 AM", "GA4 Web Analytics Sync", "Trae datos de trafico web de la ultima semana"],
        ["Domingo 02:00 AM", "Auto Prospecting Weekly", "Busca leads en noticias via RSS + OpenAI"],
        ["Lunes 07:00 AM", "Weekly Performance Report", "Reporte semanal: revenue, pipeline, outbound, recomendaciones"],
    ]
    story.append(info_table(weekly_data, [1.5*inch, 2.2*inch, 3.1*inch]))
    story.append(Spacer(1, 10))

    story.append(Paragraph("<b>On Demand (click en dashboard):</b>", STYLES["h3"]))
    demand_data = [
        ["Trigger", "Agente", "Tiempo respuesta"],
        ["Click 'Generate'", "Outbound Generate + Quality Review", "~20-40 seg"],
        ["Click 'Send'", "Outbound Send", "~5 seg"],
        ["Click 'Intel'", "Intel Brief", "~15 seg"],
        ["Avanzar a 'reunion'", "Lead to Pipeline", "~3 seg"],
        ["Bulk Insert", "Outbound Bulk Insert", "~2 seg/lead"],
        ["Subir imagen", "Image Upload", "~5 seg"],
    ]
    story.append(info_table(demand_data, [1.6*inch, 2.8*inch, 2.4*inch]))

    story.append(PageBreak())

    # === 13. STACK Y COSTOS ===
    story.append(header_bar("13. STACK TECNOLOGICO Y COSTOS", NAVY))
    story.append(Spacer(1, 12))

    stack_data = [
        ["Componente", "Tecnologia", "Costo/mes"],
        ["Frontend", "HTML / CSS / JS (vanilla, sin framework)", "$0"],
        ["Hosting", "Vercel (Hobby tier + Edge Middleware auth)", "$0"],
        ["Base de datos", "Google Sheets (9 tabs, GViz API read, Sheets API write)", "$0"],
        ["Automatizacion", "Make.com (14 escenarios, Core plan = 10K ops)", "$10.59"],
        ["Inteligencia", "OpenAI GPT-4o-mini (~730K tokens/mes)", "~$0.40"],
        ["Email", "Gmail API (envio + escaneo de respuestas)", "$0"],
        ["Analytics", "Google Analytics 4 (Data API)", "$0"],
        ["Storage", "Google Drive (imagenes temporales)", "$0"],
    ]
    story.append(info_table(stack_data, [1.4*inch, 3.6*inch, 1.2*inch]))
    story.append(Spacer(1, 14))

    # Total cost box
    cost_box = Table(
        [[Paragraph(
            '<b>COSTO TOTAL MENSUAL: ~$11 USD</b><br/>'
            '<font size="9" color="#666">Equivalente SaaS (HubSpot + Apollo + Lemlist): ~$307 USD/mes</font><br/>'
            '<font size="9" color="#16A34A"><b>Ahorro: 96.4%</b></font>',
            ParagraphStyle("cost", fontSize=14, leading=20, textColor=NAVY, fontName="Helvetica-Bold", alignment=TA_CENTER)
        )]],
        colWidths=[7.1 * inch], rowHeights=[72]
    )
    cost_box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), HexColor("#F0FDF4")),
        ("BOX", (0, 0), (-1, -1), 2, GREEN),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROUNDEDCORNERS", [8, 8, 8, 8]),
    ]))
    story.append(cost_box)
    story.append(Spacer(1, 14))

    # Operations breakdown
    story.append(Paragraph("<b>Desglose de operaciones Make.com (estimado mensual):</b>", STYLES["h3"]))
    ops_data = [
        ["Categoria", "Ops/ejecucion", "Frecuencia", "Ops/mes"],
        ["Scheduled (diarios x3)", "~8", "30 dias", "~720"],
        ["Scheduled (semanales x3)", "~8", "4 semanas", "~96"],
        ["Generate + Review (15/dia)", "~8", "300 emails", "~2,400"],
        ["Send (15/dia)", "~4", "300 envios", "~1,200"],
        ["Otros (Intel, Bulk, Images)", "~3", "~50 usos", "~150"],
        ["TOTAL", "", "", "~4,566"],
    ]
    story.append(info_table(ops_data, [2*inch, 1.3*inch, 1.3*inch, 1.3*inch]))
    story.append(Spacer(1, 8))
    story.append(Paragraph("Make Core plan incluye 10,000 ops/mes. Margen: ~54% de capacidad libre.", STYLES["small"]))

    story.append(Spacer(1, 30))

    # Footer
    story.append(HRFlowable(width="100%", thickness=1, color=BORDER))
    story.append(Spacer(1, 8))
    story.append(Paragraph(
        "MOAT Labs Command Center  |  v3.0  |  Marzo 2026  |  moat-labs-dashboard.vercel.app",
        STYLES["footer"]
    ))

    doc.build(story)
    print(f"PDF generated: {OUTPUT}")


if __name__ == "__main__":
    build_pdf()
