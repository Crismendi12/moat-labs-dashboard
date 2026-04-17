#!/usr/bin/env python3
"""Generate MOAT Labs Command Center Architecture PDF."""

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether
)

W, H = letter
ACCENT = HexColor('#4f46e5')
DARK = HexColor('#0f172a')
MUTED = HexColor('#64748b')
LIGHT_BG = HexColor('#f1f5f9')
GREEN = HexColor('#16a34a')
ORANGE = HexColor('#f97316')
RED = HexColor('#ef4444')

styles = getSampleStyleSheet()

s_title = ParagraphStyle('DocTitle', parent=styles['Title'], fontSize=28,
    textColor=DARK, spaceAfter=6, leading=34, fontName='Helvetica-Bold')
s_subtitle = ParagraphStyle('DocSub', parent=styles['Normal'], fontSize=12,
    textColor=MUTED, spaceAfter=24, alignment=TA_CENTER)
s_h1 = ParagraphStyle('H1', parent=styles['Heading1'], fontSize=18,
    textColor=DARK, spaceBefore=20, spaceAfter=10, fontName='Helvetica-Bold')
s_h2 = ParagraphStyle('H2', parent=styles['Heading2'], fontSize=14,
    textColor=ACCENT, spaceBefore=14, spaceAfter=8, fontName='Helvetica-Bold')
s_body = ParagraphStyle('Body', parent=styles['Normal'], fontSize=10,
    textColor=DARK, leading=15, spaceAfter=6)
s_small = ParagraphStyle('Small', parent=styles['Normal'], fontSize=9,
    textColor=MUTED, leading=13, spaceAfter=4)
s_bold = ParagraphStyle('Bold', parent=styles['Normal'], fontSize=10,
    textColor=DARK, fontName='Helvetica-Bold', leading=14, spaceAfter=4)
s_cell = ParagraphStyle('Cell', parent=styles['Normal'], fontSize=8,
    textColor=DARK, leading=11)
s_cell_bold = ParagraphStyle('CellBold', parent=styles['Normal'], fontSize=8,
    textColor=DARK, leading=11, fontName='Helvetica-Bold')
s_footer = ParagraphStyle('Footer', parent=styles['Normal'], fontSize=8,
    textColor=MUTED, alignment=TA_CENTER)

def accent_bar():
    t = Table([['']],colWidths=[W - 2*inch], rowHeights=[4])
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1), ACCENT),
        ('LINEBELOW',(0,0),(-1,-1),0, white)]))
    return t

def section_header(title, description):
    return KeepTogether([
        accent_bar(), Spacer(1,6),
        Paragraph(title, s_h1),
        Paragraph(description, s_body),
        Spacer(1,8)
    ])

def agent_card(name, trigger, purpose, modules, schedule=None):
    rows = [
        [Paragraph(f'<b>{name}</b>', s_cell_bold), Paragraph(trigger, s_cell)],
        [Paragraph('Purpose', s_cell_bold), Paragraph(purpose, s_cell)],
        [Paragraph('Modules', s_cell_bold), Paragraph(modules, s_cell)],
    ]
    if schedule:
        rows.append([Paragraph('Schedule', s_cell_bold), Paragraph(schedule, s_cell)])
    t = Table(rows, colWidths=[1.2*inch, 5*inch])
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(0,-1), LIGHT_BG),
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('BOX',(0,0),(-1,-1),0.5, MUTED),
        ('INNERGRID',(0,0),(-1,-1),0.25, HexColor('#e2e8f0')),
        ('TOPPADDING',(0,0),(-1,-1),4),
        ('BOTTOMPADDING',(0,0),(-1,-1),4),
        ('LEFTPADDING',(0,0),(-1,-1),6),
        ('RIGHTPADDING',(0,0),(-1,-1),6),
    ]))
    return KeepTogether([t, Spacer(1,10)])

def build_pdf():
    path = '/Users/cristianjaviermendivelsohincapie/Claude/moat-labs-dashboard/docs/MOAT_Labs_Architecture.pdf'
    doc = SimpleDocTemplate(path, pagesize=letter,
        topMargin=0.7*inch, bottomMargin=0.7*inch,
        leftMargin=inch, rightMargin=inch)
    story = []

    # === COVER ===
    story.append(Spacer(1, 1.5*inch))
    story.append(accent_bar())
    story.append(Spacer(1, 20))
    story.append(Paragraph('MOAT Labs', s_title))
    story.append(Paragraph('Command Center Architecture', ParagraphStyle('Sub2',
        parent=s_title, fontSize=20, textColor=ACCENT)))
    story.append(Spacer(1, 12))
    story.append(Paragraph('How every automation, agent, and system works together.', s_subtitle))
    story.append(Spacer(1, 8))
    story.append(Paragraph('For the MOAT Labs team  |  March 2026', s_subtitle))

    story.append(Spacer(1, 1*inch))

    # Overview box
    overview_data = [
        [Paragraph('<b>14 Agents</b>', s_cell_bold), Paragraph('<b>7 Layers</b>', s_cell_bold),
         Paragraph('<b>$97/mo</b>', s_cell_bold), Paragraph('<b>1 Dashboard</b>', s_cell_bold)],
        [Paragraph('Make.com scenarios', s_cell), Paragraph('Functional areas', s_cell),
         Paragraph('Total tool cost', s_cell), Paragraph('moat-labs-dashboard.vercel.app', s_cell)],
    ]
    t = Table(overview_data, colWidths=[1.4*inch]*4)
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,-1), LIGHT_BG),
        ('ALIGN',(0,0),(-1,-1),'CENTER'),
        ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
        ('BOX',(0,0),(-1,-1),1, ACCENT),
        ('INNERGRID',(0,0),(-1,-1),0.5, HexColor('#e2e8f0')),
        ('TOPPADDING',(0,0),(-1,-1),8),
        ('BOTTOMPADDING',(0,0),(-1,-1),8),
    ]))
    story.append(t)
    story.append(PageBreak())

    # === PAGE 2: SYSTEM MAP ===
    story.append(section_header('System Map',
        'The Command Center connects 4 platforms. Every arrow is automated -- no manual data entry.'))

    flow = """
    GOOGLE SHEETS (Database)
         |
         v
    MAKE.COM (14 Scenarios) <---> OPENAI (GPT-4o-mini)
         |
         v
    VERCEL (Dashboard) + GMAIL (Delivery)
    """
    story.append(Paragraph('<font face="Courier" size="9">' + flow.replace('\n','<br/>').replace(' ','&nbsp;') + '</font>', s_body))
    story.append(Spacer(1,8))

    platforms = [
        ['Platform', 'Role', 'Cost'],
        ['Google Sheets', 'Database: Pipeline, Outbound, Contabilidad, Prospecting, Analytics', 'Free'],
        ['Make.com', '14 automated scenarios (webhooks, RSS, schedules)', '$29/mo'],
        ['OpenAI (GPT-4o-mini)', 'AI brain: emails, intel briefs, prospecting, reports', '$5-10/mo'],
        ['Vercel', 'Dashboard hosting + Vercel password protection', 'Free'],
        ['Gmail', 'Email delivery for outbound + newsletters + briefs', 'Free'],
        ['Google Analytics 4', 'Website traffic tracking (moatlabs-ventures.com)', 'Free'],
        ['Google Drive', 'Image storage for content posts', 'Free'],
    ]
    t = Table(platforms, colWidths=[1.8*inch, 3.5*inch, 0.9*inch])
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0), DARK),
        ('TEXTCOLOR',(0,0),(-1,0), white),
        ('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),
        ('FONTSIZE',(0,0),(-1,-1), 8),
        ('ALIGN',(2,0),(2,-1),'CENTER'),
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('BOX',(0,0),(-1,-1),0.5, MUTED),
        ('INNERGRID',(0,0),(-1,-1),0.25, HexColor('#e2e8f0')),
        ('ROWBACKGROUNDS',(0,1),(-1,-1),[white, LIGHT_BG]),
        ('TOPPADDING',(0,0),(-1,-1),5),
        ('BOTTOMPADDING',(0,0),(-1,-1),5),
        ('LEFTPADDING',(0,0),(-1,-1),6),
    ]))
    story.append(t)
    story.append(PageBreak())

    # === LAYER 1: OUTBOUND ENGINE ===
    story.append(section_header('Layer 1: Outbound Sales Engine',
        'AI-powered cold outreach with quality gates, 3-touch sequences, and domain safety. '
        'Handles the entire lifecycle from lead insert to response detection.'))

    story.append(agent_card(
        'Outbound Generate', 'Webhook (dashboard "Generate" button)',
        'AI writes a personalized cold email using segment-specific playbooks (VCs LATAM, Founders LATAM, etc.). '
        'Includes discovery link and website in signature. Returns [SUBJECT] and [BODY].',
        'Webhook -> OpenAI (GPT-4o-mini) -> WebhookRespond'))

    story.append(agent_card(
        'Quality Review Agent', 'Webhook (auto-triggered after Generate)',
        'Scores every email 0-100 on spam risk, personalization, tone, and ICP fit. '
        'If score < 70, the Send button is blocked in the dashboard with "Revise first".',
        'Webhook -> OpenAI -> WebhookRespond'))

    story.append(agent_card(
        'Outbound Send', 'Webhook (dashboard "Send" button)',
        'Sends the approved email via Gmail. Updates Status column, sets SeqStep=1 and LastSent=today.',
        'Webhook -> Gmail send -> Google Sheets update'))

    story.append(agent_card(
        'Auto Follow-up Generator', 'Daily 8:00 AM COT',
        '3-touch sequence: reads SeqStep + LastSent for every auto lead. '
        'SeqStep=1 + 3 days elapsed = generate Follow-up. SeqStep=2 + 5 days = generate Break-up. '
        'Writes to Subject/Message columns but does NOT send (human reviews first).',
        'Sheets read -> OpenAI -> Sheets update', 'Daily 8:00 AM COT'))

    story.append(agent_card(
        'Gmail Response Scanner', 'Daily 9:00 AM COT',
        'Scans inbox for replies to outbound leads. Cross-references sender email with Outbound sheet. '
        'Updates status to "respondio" when a reply is detected.',
        'Gmail search -> Sheets cross-reference -> Sheets update', 'Daily 9:00 AM COT'))

    story.append(agent_card(
        'Bulk Insert', 'Webhook',
        'Inserts new leads into the Outbound sheet tab. Used by Prospecting "Add to Outbound" button '
        'and bulk import workflows.',
        'Webhook -> Google Sheets addRow'))

    story.append(PageBreak())

    # === LAYER 2: PROSPECTING ===
    story.append(section_header('Layer 2: Lead Discovery (Prospecting)',
        'Weekly automated lead discovery from news. Strict ICP filtering ensures only relevant '
        'small/mid-size LATAM companies appear.'))

    story.append(agent_card(
        'Auto Prospecting Weekly', 'Weekly (Monday)',
        'Scans 2 RSS feeds (Spanish + English) for news about startups and SMBs in LATAM. '
        'OpenAI extracts leads matching strict ICP: 10-50 employees, commoditized industries '
        '(marketing agencies, insurance, recruiting, IT services, etc.), $100K-$5M revenue. '
        'Explicitly rejects Fortune 500, Big 4, and global tech companies. '
        'Writes structured [LEAD] blocks to Prospecting sheet tab.',
        'RSS (ES) -> Aggregator -> RSS (EN) -> Aggregator -> OpenAI -> Sheets',
        'Weekly, Monday'))

    story.append(Paragraph('<b>ICP Filter (Dashboard-side):</b> Even if OpenAI slips, the dashboard '
        'has a blocklist of 35+ non-ICP companies (Salesforce, Deloitte, etc.) that are filtered before display. '
        'Leads are deduplicated by company name (highest score wins) and paginated 5 at a time.',
        s_small))
    story.append(Spacer(1,8))

    story.append(Paragraph('<b>User Actions:</b> Each lead card has "Add to Outbound" (sends to Bulk Insert webhook) '
        'and "Dismiss" (saved to localStorage, never shown again).', s_small))

    story.append(PageBreak())

    # === LAYER 3: INTELLIGENCE ===
    story.append(section_header('Layer 3: Competitive Intelligence',
        'On-demand AI analysis for active deals in the pipeline.'))

    story.append(agent_card(
        'Intel Brief', 'Webhook (dashboard "Intel" button)',
        'Generates a strategic intelligence brief for any company in the pipeline. '
        'Searches Google News RSS for recent articles, then OpenAI produces: '
        'Company Snapshot, Recent Signals, Pain Points, and Conversation Starters. '
        'Has error handling (Resume) so it works even when RSS returns no results.',
        'Webhook -> RSS (with error handler) -> Aggregator -> OpenAI -> WebhookRespond',
        'On-demand (instant)'))

    # === LAYER 4: PIPELINE BRIDGE ===
    story.append(section_header('Layer 4: Pipeline Management',
        'Connects outbound nurturing to the sales pipeline.'))

    story.append(agent_card(
        'Lead to Pipeline', 'Webhook (dashboard modal)',
        'When a lead advances to "reunion" status, the dashboard shows a deal creation modal. '
        'On confirm, creates a new row in the Pipeline sheet with company, contact, deal value, '
        'stage, and date. Bridges outbound automation with pipeline tracking.',
        'Webhook -> Google Sheets addRow (Pipeline tab) -> WebhookRespond'))

    story.append(PageBreak())

    # === LAYER 5: CEO INTELLIGENCE ===
    story.append(section_header('Layer 5: CEO Intelligence Layer',
        'Daily and weekly automated reports so the CEO starts every day informed.'))

    story.append(agent_card(
        'CEO Morning Brief', 'Daily 7:00 AM COT',
        'Reads Pipeline, Outbound, and Contabilidad sheets via Google Sheets API. '
        'OpenAI generates a scannable daily brief: revenue tracker, action items, '
        'pipeline health, outbound pulse, and priority #1. Minimal HTML, designed for phone.',
        'Sheets API (3x) -> JSON Transform (3x) -> OpenAI -> Gmail',
        'Daily 7:00 AM COT'))

    story.append(agent_card(
        'Weekly Performance Report', 'Weekly Monday 7:00 AM COT',
        'Comprehensive weekly report: revenue vs $100K target, pipeline summary, '
        'outbound stats (sent, response rate, meeting rate), and top 3 actionable recommendations.',
        'Sheets read -> OpenAI -> Gmail',
        'Weekly, Monday 7:00 AM COT'))

    # === LAYER 6: CONTENT & ANALYTICS ===
    story.append(section_header('Layer 6: Content & Web Analytics',
        'Tracks website performance and supports content management.'))

    story.append(agent_card(
        'GA4 Weekly Sync', 'Weekly Sunday 7:00 AM UTC',
        'Pulls traffic data from Google Analytics 4 (property 510766684) via Data API. '
        'Two reports: traffic sources and top pages. Writes JSON to Analytics sheet tab. '
        'Dashboard parses and displays as charts.',
        'GA4 Data API (2x runReport) -> JSON Transform (2x) -> Sheets addRow',
        'Weekly, Sunday'))

    story.append(agent_card(
        'Image Upload', 'Webhook',
        'Uploads images to Google Drive for content posts. Returns public URL.',
        'Webhook -> Google Drive upload -> WebhookRespond'))

    story.append(agent_card(
        'Image Cleanup', 'Daily',
        'Deletes moat-img-* files older than 5 days from Google Drive to manage storage.',
        'Google Drive list -> filter -> delete',
        'Daily'))

    story.append(PageBreak())

    # === LAYER 7: DASHBOARD ===
    story.append(section_header('Layer 7: Dashboard (Frontend)',
        'Static HTML/CSS/JS app deployed on Vercel. No build tools. Google Sheets as read-only backend via GViz API.'))

    tabs = [
        ['Tab', 'Sections', 'Data Sources'],
        ['Ventas', 'KPIs (leads, revenue, win rate) + Pipeline Funnel + Intel Briefs + '
         'Outbound Queue (nurture stages, scoring, generate/send) + Prospecting + Contact Segments',
         'Pipeline, Metricas, Contabilidad, Outbound, Prospecting'],
        ['Finanzas', 'Contabilidad (client payments, pending, expenses, balance) + '
         'Cascada Financiera (waterfall: cobrado -> IVA -> Catalina -> taxes -> net)',
         'Contabilidad, Gastos'],
        ['Contenido', 'Web Analytics (GA4 charts) + Content Calendar + LinkedIn Performance + SSI + Audience',
         'Contenido, LinkedIn, Analytics'],
        ['Operaciones', 'Sales Velocity metrics + Performance Charts',
         'Pipeline, Gastos, Contenido, Metricas'],
    ]
    t = Table(tabs, colWidths=[1*inch, 3.2*inch, 2*inch])
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0), DARK),
        ('TEXTCOLOR',(0,0),(-1,0), white),
        ('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),
        ('FONTSIZE',(0,0),(-1,-1), 8),
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('BOX',(0,0),(-1,-1),0.5, MUTED),
        ('INNERGRID',(0,0),(-1,-1),0.25, HexColor('#e2e8f0')),
        ('ROWBACKGROUNDS',(0,1),(-1,-1),[white, LIGHT_BG]),
        ('TOPPADDING',(0,0),(-1,-1),5),
        ('BOTTOMPADDING',(0,0),(-1,-1),5),
        ('LEFTPADDING',(0,0),(-1,-1),6),
    ]))
    story.append(t)
    story.append(Spacer(1,12))

    features = [
        '<b>Quick Actions Bar:</b> Fixed bottom bar with live counts -- Review Queue, Responses, Pipeline Value.',
        '<b>Lead Scoring:</b> Calculated client-side. 85+ Hot (green), 70-84 Warm (orange), &lt;70 Cold (gray).',
        '<b>Segment Playbooks:</b> 6 playbooks auto-detected by source/industry/country. Each shapes the AI email.',
        '<b>Domain Safety:</b> 15 emails/day max. Volume tracked in localStorage. Quality gate blocks sends &lt; 70.',
        '<b>Outbound-to-Pipeline Bridge:</b> Deal creation modal when advancing leads to "reunion".',
        '<b>Lazy Loading:</b> Each tab only fetches the Google Sheets tabs it needs. Cache shared across tabs.',
    ]
    for f in features:
        story.append(Paragraph(f, s_small))
    story.append(PageBreak())

    # === DATA FLOW DIAGRAM ===
    story.append(section_header('Complete Data Flow',
        'How data moves through the system, from lead discovery to deal close.'))

    flow_data = [
        ['Stage', 'What Happens', 'Agents Involved'],
        ['1. Discovery', 'RSS scans news weekly. OpenAI extracts ICP-matching leads. '
         'Written to Prospecting sheet.', 'Auto Prospecting Weekly'],
        ['2. Qualification', 'CEO reviews leads in dashboard. Clicks "Add to Outbound" '
         'or "Dismiss".', 'Bulk Insert (webhook)'],
        ['3. Outreach', 'AI generates personalized email using segment playbook. '
         'Quality gate scores it. CEO reviews and clicks Send.', 'Outbound Generate + Quality Review + Outbound Send'],
        ['4. Follow-up', 'Auto Follow-up checks timing daily. Generates Touch 2 (day 3) '
         'and Touch 3 (day 8). Human reviews before sending.', 'Auto Follow-up Generator'],
        ['5. Response', 'Gmail scanner detects replies. Updates lead status to "respondio". '
         'Dashboard shows post-response context panel.', 'Gmail Response Scanner'],
        ['6. Meeting', 'Lead advanced to "reunion". Deal creation modal fires. '
         'New Pipeline row created automatically.', 'Lead to Pipeline'],
        ['7. Close', 'Deal progresses through Pipeline (Lead -> Meeting -> Closing -> Win). '
         'Revenue tracked in Contabilidad.', 'Dashboard + manual'],
        ['8. Reporting', 'CEO Morning Brief (daily), Weekly Performance Report (Monday), '
         'GA4 data sync (Sunday).', 'CEO Brief + Weekly Report + GA4 Sync'],
    ]
    t = Table(flow_data, colWidths=[1*inch, 3.2*inch, 2*inch])
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0), DARK),
        ('TEXTCOLOR',(0,0),(-1,0), white),
        ('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),
        ('FONTSIZE',(0,0),(-1,-1), 8),
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('BOX',(0,0),(-1,-1),0.5, MUTED),
        ('INNERGRID',(0,0),(-1,-1),0.25, HexColor('#e2e8f0')),
        ('ROWBACKGROUNDS',(0,1),(-1,-1),[white, LIGHT_BG]),
        ('TOPPADDING',(0,0),(-1,-1),5),
        ('BOTTOMPADDING',(0,0),(-1,-1),5),
        ('LEFTPADDING',(0,0),(-1,-1),6),
    ]))
    story.append(t)
    story.append(PageBreak())

    # === COST BREAKDOWN ===
    story.append(section_header('Monthly Cost Breakdown',
        'Total operational cost to run the full Command Center.'))

    costs = [
        ['Service', 'Plan', 'Monthly Cost', 'What It Does'],
        ['Make.com', 'Core (10K ops)', '$29.00', '14 scenarios, webhooks, scheduling'],
        ['OpenAI API', 'Pay-as-you-go', '$5-10', 'GPT-4o-mini for all AI tasks'],
        ['Vercel', 'Hobby (free)', '$0', 'Dashboard hosting + password'],
        ['Google Sheets', 'Free', '$0', 'Database (7 tabs)'],
        ['Gmail', 'Free', '$0', 'Email delivery'],
        ['Google Analytics 4', 'Free', '$0', 'Website traffic tracking'],
        ['Google Drive', 'Free', '$0', 'Image storage'],
        ['Instantly', 'Growth', '$47.00', 'Cold outreach (separate domain)'],
        ['', '', '', ''],
        ['TOTAL', '', '$81-97/mo', ''],
    ]
    t = Table(costs, colWidths=[1.4*inch, 1.3*inch, 1*inch, 2.5*inch])
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0), DARK),
        ('TEXTCOLOR',(0,0),(-1,0), white),
        ('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),
        ('FONTSIZE',(0,0),(-1,-1), 8),
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('BOX',(0,0),(-1,-1),0.5, MUTED),
        ('INNERGRID',(0,0),(-1,-1),0.25, HexColor('#e2e8f0')),
        ('ROWBACKGROUNDS',(0,1),(-1,-2),[white, LIGHT_BG]),
        ('BACKGROUND',(0,-1),(-1,-1), ACCENT),
        ('TEXTCOLOR',(0,-1),(-1,-1), white),
        ('FONTNAME',(0,-1),(-1,-1),'Helvetica-Bold'),
        ('TOPPADDING',(0,0),(-1,-1),5),
        ('BOTTOMPADDING',(0,0),(-1,-1),5),
        ('LEFTPADDING',(0,0),(-1,-1),6),
    ]))
    story.append(t)
    story.append(Spacer(1, 20))

    # SaaS comparison
    story.append(Paragraph('<b>vs. SaaS Alternatives:</b>', s_bold))
    compare = [
        ['Capability', 'SaaS Alternative', 'SaaS Cost', 'MOAT Cost'],
        ['CRM + Pipeline', 'HubSpot Sales Pro', '$450/mo', '$0 (Sheets)'],
        ['Email Sequences', 'Apollo.io', '$99/mo', '$29 (Make)'],
        ['AI Email Writing', 'Lavender.ai', '$49/mo', '$5 (OpenAI API)'],
        ['Competitive Intel', 'Crayon.co', '$500/mo', '$0 (included)'],
        ['Prospecting', 'ZoomInfo', '$250/mo', '$0 (included)'],
        ['Analytics Dashboard', 'Databox', '$79/mo', '$0 (Vercel)'],
        ['', 'TOTAL', '$1,427/mo', '$81-97/mo'],
    ]
    t = Table(compare, colWidths=[1.5*inch, 1.5*inch, 1.2*inch, 1.2*inch])
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0), DARK),
        ('TEXTCOLOR',(0,0),(-1,0), white),
        ('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),
        ('FONTSIZE',(0,0),(-1,-1), 8),
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('BOX',(0,0),(-1,-1),0.5, MUTED),
        ('INNERGRID',(0,0),(-1,-1),0.25, HexColor('#e2e8f0')),
        ('ROWBACKGROUNDS',(0,1),(-1,-2),[white, LIGHT_BG]),
        ('BACKGROUND',(0,-1),(-1,-1), GREEN),
        ('TEXTCOLOR',(0,-1),(-1,-1), white),
        ('FONTNAME',(0,-1),(-1,-1),'Helvetica-Bold'),
        ('TOPPADDING',(0,0),(-1,-1),5),
        ('BOTTOMPADDING',(0,0),(-1,-1),5),
        ('LEFTPADDING',(0,0),(-1,-1),6),
    ]))
    story.append(t)
    story.append(PageBreak())

    # === SCENARIO REFERENCE TABLE ===
    story.append(section_header('Quick Reference: All 14 Agents',
        'Complete list of every Make.com scenario with IDs, triggers, and schedules.'))

    ref = [
        ['ID', 'Name', 'Trigger', 'Schedule'],
        ['4482536', 'Auto Prospecting Weekly', 'Scheduled', 'Monday'],
        ['4481670', 'Outbound Generate', 'Webhook', 'On-demand'],
        ['4486756', 'Quality Review Agent', 'Webhook', 'On-demand'],
        ['4481672', 'Outbound Send', 'Webhook', 'On-demand'],
        ['4486869', 'Auto Follow-up Generator', 'Scheduled', 'Daily 8AM COT'],
        ['4486974', 'Gmail Response Scanner', 'Scheduled', 'Daily 9AM COT'],
        ['4482358', 'Bulk Insert', 'Webhook', 'On-demand'],
        ['4481549', 'Intel Brief', 'Webhook (instant)', 'On-demand'],
        ['4487489', 'Lead to Pipeline', 'Webhook', 'On-demand'],
        ['4487522', 'CEO Morning Brief', 'Scheduled', 'Daily 7AM COT'],
        ['4487158', 'Weekly Performance Report', 'Scheduled', 'Monday 7AM COT'],
        ['4485921', 'GA4 Weekly Sync', 'Scheduled', 'Sunday 7AM UTC'],
        ['4481443', 'Image Upload', 'Webhook', 'On-demand'],
        ['4481444', 'Image Cleanup', 'Scheduled', 'Daily'],
    ]
    t = Table(ref, colWidths=[0.7*inch, 2.2*inch, 1.5*inch, 1.5*inch])
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0), DARK),
        ('TEXTCOLOR',(0,0),(-1,0), white),
        ('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),
        ('FONTSIZE',(0,0),(-1,-1), 8),
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('BOX',(0,0),(-1,-1),0.5, MUTED),
        ('INNERGRID',(0,0),(-1,-1),0.25, HexColor('#e2e8f0')),
        ('ROWBACKGROUNDS',(0,1),(-1,-1),[white, LIGHT_BG]),
        ('TOPPADDING',(0,0),(-1,-1),4),
        ('BOTTOMPADDING',(0,0),(-1,-1),4),
        ('LEFTPADDING',(0,0),(-1,-1),6),
    ]))
    story.append(t)
    story.append(Spacer(1, 20))

    # === KEY URLS ===
    story.append(Paragraph('<b>Key URLs</b>', s_h2))
    urls = [
        ['Resource', 'URL'],
        ['Dashboard', 'https://moat-labs-dashboard.vercel.app'],
        ['Website', 'https://www.moatlabs-ventures.com'],
        ['Discovery Call', 'https://calendar.app.google/QLhJS3bpbAJfreNXA'],
        ['Google Sheet', 'docs.google.com/spreadsheets/d/1VcCoM6Un9G5XLddgvPCqc5dj4UCDpI_y76PIUM8fGIo'],
    ]
    t = Table(urls, colWidths=[1.3*inch, 4.8*inch])
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0), DARK),
        ('TEXTCOLOR',(0,0),(-1,0), white),
        ('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),
        ('FONTSIZE',(0,0),(-1,-1), 8),
        ('BOX',(0,0),(-1,-1),0.5, MUTED),
        ('INNERGRID',(0,0),(-1,-1),0.25, HexColor('#e2e8f0')),
        ('ROWBACKGROUNDS',(0,1),(-1,-1),[white, LIGHT_BG]),
        ('TOPPADDING',(0,0),(-1,-1),5),
        ('BOTTOMPADDING',(0,0),(-1,-1),5),
        ('LEFTPADDING',(0,0),(-1,-1),6),
    ]))
    story.append(t)

    story.append(Spacer(1, 30))
    story.append(accent_bar())
    story.append(Spacer(1, 8))
    story.append(Paragraph('MOAT Labs Command Center  |  Built by Cristian Mendivelso  |  March 2026', s_footer))

    doc.build(story)
    return path

if __name__ == '__main__':
    p = build_pdf()
    print(f'PDF generated: {p}')
