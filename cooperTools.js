export const airesTemplateToolIds = Object.freeze([
  "client_capability_matrix",
  "context_to_product_content",
  "daily_rep_flow",
  "data_flywheel",
  "jtbd_canvas",
  "personas_manager_rep",
  "scoped_requirements_rep_velocity",
  "service_blueprint",
  "thesis_rep_velocity"
]);

export const cooperToolDefinitions = [
  {
    type: "function",
    name: "check_calendar",
    description: "Check whether Michael is available at a requested date and time.",
    parameters: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "Requested meeting date, ideally YYYY-MM-DD."
        },
        time: {
          type: "string",
          description: "Requested meeting time, ideally HH:MM with timezone if known."
        }
      },
      required: ["date", "time"]
    }
  },
  {
    type: "function",
    name: "search_workspace_context",
    description: "Search internal workspace context across CRM, docs, tickets, onboarding records, product notes, meeting memory, calendar, Slack, and related systems.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        sources: {
          type: "array",
          items: {
            type: "string",
            enum: ["crm", "docs", "tickets", "onboarding", "github", "slack", "calendar", "memory", "notion"]
          }
        },
        customer_or_account: { type: "string" },
        time_range: { type: "string" }
      },
      required: ["query"]
    }
  },
  {
    type: "function",
    name: "search_notion_workspace",
    description: "Search Michael's connected Notion workspace for pages or databases relevant to a meeting, ticket, project, feature epic, or requirements discussion. Uses Arcade when mapped, otherwise direct Notion API if configured.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query, usually a feature name, ticket title, customer/account name, meeting topic, or product phrase."
        },
        filter: {
          type: "string",
          enum: ["all", "pages", "data_sources", "databases"],
          description: "Limit search to pages or data sources. 'databases' is accepted as a legacy alias. Defaults to all."
        },
        page_size: {
          type: "number",
          description: "Maximum result count, 1-10. Defaults to 5."
        }
      },
      required: ["query"]
    }
  },
  {
    type: "function",
    name: "fetch_notion_page",
    description: "Fetch a Notion page by URL or ID and optionally include readable block content so Cooper can discuss it, summarize it, or turn it into scoped requirements.",
    parameters: {
      type: "object",
      properties: {
        page_id_or_url: {
          type: "string",
          description: "A Notion page ID or full Notion URL."
        },
        include_blocks: {
          type: "boolean",
          description: "Whether to include page block content. Defaults to true."
        },
        max_blocks: {
          type: "number",
          description: "Maximum page blocks to fetch, 1-100. Defaults to 50."
        }
      },
      required: ["page_id_or_url"]
    }
  },
  {
    type: "function",
    name: "get_customer_context",
    description: "Get CRM, onboarding, support, and integration context for a customer or account.",
    parameters: {
      type: "object",
      properties: {
        customer_name: { type: "string" },
        include: {
          type: "array",
          items: {
            type: "string",
            enum: ["crm", "onboarding", "support", "integrations", "docs", "recent_activity"]
          }
        }
      },
      required: ["customer_name"]
    }
  },
  {
    type: "function",
    name: "inspect_engineering_context",
    description: "Inspect engineering context such as GitHub issues, pull requests, code references, Linear/Jira tickets, incidents, and technical docs.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        repo: { type: "string" },
        ticket_id: { type: "string" },
        include_code: { type: "boolean" }
      },
      required: ["query"]
    }
  },
  {
    type: "function",
    name: "create_followup_action",
    description: "Prepare or create an approved follow-up action such as a task, ticket, calendar event, CRM note, email draft, or Slack message. Writes require explicit Michael confirmation.",
    parameters: {
      type: "object",
      properties: {
        action_type: {
          type: "string",
          enum: ["task", "ticket", "calendar_event", "crm_note", "email_draft", "slack_message"]
        },
        title: { type: "string" },
        description: { type: "string" },
        owner: { type: "string" },
        due_date: { type: "string" },
        destination: { type: "string" },
        requires_confirmation: { type: "boolean" },
        confirmed_by_michael: {
          type: "boolean",
          description: "True only after Michael explicitly confirms this exact write action."
        }
      },
      required: ["action_type", "title"]
    }
  },
  {
    type: "function",
    name: "run_gstack_skill",
    description: "Run an advisory GStack-style review skill over provided meeting context, project context, sprint ticket text, code snippets, product plans, QA flows, or prototype ideas. This tool only produces critique/specs/recommendations and never mutates code or external systems.",
    parameters: {
      type: "object",
      properties: {
        skill: {
          type: "string",
          enum: ["ceo_review", "engineering_review", "code_review", "qa_review", "spec", "office_hours", "design_review"],
          description: "The advisory review skill to run."
        },
        input: {
          type: "string",
          description: "The primary content to review or transform. Include the latest relevant request, plan, transcript excerpt, code snippet, QA flow, or design description."
        },
        context: {
          type: "string",
          description: "Optional supporting context such as active project notes, recent meeting memory, constraints, or previously discussed requirements."
        },
        mode: {
          type: "string",
          enum: ["advisory", "structured", "voice_summary"],
          description: "Use advisory for balanced critique, structured for deeper written output, and voice_summary for a concise spoken response."
        }
      },
      required: ["skill", "input"]
    }
  },
  {
    type: "function",
    name: "create_canvas_artifact",
    description: "Queue a background visual collaboration artifact for the live call canvas, such as a Mermaid architecture/workflow diagram, a mobile-first UI wireframe, or an HTML prototype. Returns immediately with a queued job while the conversation continues.",
    parameters: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["mermaid_diagram", "ui_wireframe", "html_prototype"],
          description: "The type of canvas artifact to create."
        },
        title: {
          type: "string",
          description: "Short title for the canvas artifact."
        },
        prompt: {
          type: "string",
          description: "Specific request for what Cooper should draw, diagram, wireframe, or prototype."
        },
        context: {
          type: "string",
          description: "Relevant meeting, project, product, architecture, workflow, or UI context to use when creating the artifact."
        }
      },
      required: ["kind", "prompt"]
    }
  },
  {
    type: "function",
    name: "create_document_artifact",
    description: "Queue a durable background document from the live session while the conversation continues. Use this for executive briefs, PRDs, execution plans, QA plans, ADRs, sprint recaps, decision logs, release briefs, Office files, or reports. Returns immediately with a job id and visible pipeline status.",
    parameters: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: [
            "post_call_kit",
            "execution_plan",
            "qa_checklist",
            "follow_up",
            "code_sketch",
            "product_requirements",
            "architecture_decision_record",
            "sprint_recap",
            "decision_log",
            "release_brief",
            "pdf_brief",
            "word_brief",
            "powerpoint_deck",
            "excel_action_register",
            "executive_report"
          ],
          description: "The document contract Cooper should generate."
        },
        title: {
          type: "string",
          description: "Optional short document title."
        },
        instruction: {
          type: "string",
          description: "What the document should accomplish, emphasize, revise, or answer."
        },
        context: {
          type: "string",
          description: "Optional priority source context from the current conversation or connected workspace."
        },
        priority: {
          type: "string",
          enum: ["low", "normal", "high", "urgent"],
          description: "Queue priority. Defaults to normal."
        }
      },
      required: ["kind", "instruction"]
    }
  },
  {
    type: "function",
    name: "render_mcp_app",
    description: "Render an MCP App or AG-UI visual surface into Cooper's live call canvas. Use this for interactive code previews, diagrams, approval cards, dashboards, forms, or UI resources exposed by MCP tools.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Short title for the canvas app."
        },
        description: {
          type: "string",
          description: "One-sentence reason this app belongs on the canvas."
        },
        server_id: {
          type: "string",
          description: "Configured MCP App server id, if rendering a ui:// resource from a server."
        },
        resource_uri: {
          type: "string",
          description: "MCP UI resource URI, usually beginning with ui://, if one was returned by a tool."
        },
        tool_name: {
          type: "string",
          description: "The MCP or Cooper tool that produced this app, when known."
        },
        html: {
          type: "string",
          description: "Optional complete inline HTML document for a lightweight MCP App preview when no resource URI is available."
        },
        state: {
          type: "object",
          description: "Optional AG-UI style state snapshot for the app, such as status, selected item, diagram type, or preview metadata."
        }
      },
      required: ["title"]
    }
  },
  {
    type: "function",
    name: "present_aires_example",
    description: "Show one of the prebuilt AIRES example flows on Cooper's live canvas while explaining or teaching it. Use for Jobs to be Done, service blueprint, data flywheel, capability matrix, personas, daily rep flow, context-to-product-content, product thesis, or scoped requirements examples.",
    parameters: {
      type: "object",
      properties: {
        example_id: {
          type: "string",
          enum: [
            "client_capability_matrix",
            "context_to_product_content",
            "daily_rep_flow",
            "data_flywheel",
            "jtbd_canvas",
            "personas_manager_rep",
            "scoped_requirements_rep_velocity",
            "service_blueprint",
            "thesis_rep_velocity"
          ],
          description: "The AIRES example to display on the canvas."
        },
        mode: {
          type: "string",
          enum: ["show", "educate", "compare", "build_from_context"],
          description: "How Cooper should use the example. Defaults to educate."
        },
        reason: {
          type: "string",
          description: "Short explanation for why this example is being presented."
        },
        context: {
          type: "string",
          description: "Relevant meeting or project context to connect to the example during the spoken explanation."
        }
      },
      required: ["example_id"]
    }
  },
  {
    type: "function",
    name: "generate_aires_template_artifact",
    description: "Queue one or more AIRES template documents from the live call transcript and loaded project/context while Cooper keeps talking. Use this when Michael asks to generate Jobs to be Done, service blueprint, daily rep flow, data flywheel, capability matrix, personas, context-to-product-content, product thesis, or scoped requirements from the current conversation.",
    parameters: {
      type: "object",
      properties: {
        template_id: {
          type: "string",
          enum: [...airesTemplateToolIds, "all"],
          description: "Which AIRES template to generate. Use jtbd_canvas for Jobs to be Done/JTBD, data_flywheel for flywheel, service_blueprint for service map, daily_rep_flow for rep workflow, and all when Michael asks for the full document stack."
        },
        template_ids: {
          type: "array",
          items: {
            type: "string",
            enum: airesTemplateToolIds
          },
          description: "Optional explicit list of AIRES templates to generate when Michael asks for multiple named documents."
        },
        title: {
          type: "string",
          description: "Optional custom title for a single generated artifact."
        },
        instruction: {
          type: "string",
          description: "Specific guidance Michael gave for this generated document."
        },
        context: {
          type: "string",
          description: "Relevant recent meeting/project context, constraints, vivid phrases, or source material to prioritize."
        }
      },
      required: ["template_id"]
    }
  },
  {
    type: "function",
    name: "run_aires_requirements_framework",
    description: "Unified AIRES Requirements Workshop orchestrator. Recommend the right artifacts from conversation context, explain or workshop the framework, provide a spoken draft outline, queue one document or the full AIRES suite in the background, and report live run status while the call continues.",
    parameters: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["list_framework", "explain_documents", "explain_document", "workshop_document", "interview", "recommend_artifacts", "draft_outline", "queue_artifact", "queue_suite", "status"],
          description: "Use recommend_artifacts when Michael asks what to create, draft_outline to explain the gist before building, queue_artifact for one document, queue_suite for all or several documents, and status to report background progress."
        },
        topic: {
          type: "string",
          description: "Short name for the feature, epic, product idea, workflow, or requirement area."
        },
        source_context: {
          type: "string",
          description: "Relevant transcript excerpt, project context, raw feature idea, ticket text, user phrases, constraints, or discovery notes."
        },
        artifact_title: {
          type: "string",
          description: "Optional title for the generated scoped requirements artifact."
        },
        template_id: {
          type: "string",
          enum: airesTemplateToolIds,
          description: "Specific AIRES template for draft_outline or queue_artifact."
        },
        template_ids: {
          type: "array",
          items: { type: "string", enum: airesTemplateToolIds },
          description: "Optional subset for queue_suite. Omit to generate the complete nine-document suite."
        },
        run_id: {
          type: "string",
          description: "Optional durable requirements run id for status checks or continuing a grouped suite."
        },
        max_recommendations: {
          type: "integer",
          minimum: 1,
          maximum: 9,
          description: "Maximum recommendations to return. Defaults to four."
        },
        document_key: {
          type: "string",
          enum: ["all", "skill", "requirements_framework", "pipeline", "design_system", "artifact_catalog", "template", "tokens", "agent_manifest"],
          description: "AIRES framework document to explain or workshop. Use all for explain_documents."
        },
        detail_level: {
          type: "string",
          enum: ["summary", "detailed", "source"],
          description: "How much document detail to return when explaining framework documents. Defaults to summary."
        },
        current_draft: {
          type: "string",
          description: "Optional existing draft, HTML, Markdown, ticket text, or artifact copy to critique or revise through the selected AIRES document lens."
        },
        goal: {
          type: "string",
          description: "What Michael wants to accomplish in the workshop, such as sharpen scope, create slices, audit brand fit, or choose an artifact form."
        },
        requested_output: {
          type: "string",
          description: "Desired workshop output, such as spoken recommendations, Markdown working draft, AIRES HTML artifact plan, acceptance criteria, or brand critique."
        },
        workshop_focus: {
          type: "string",
          enum: ["shape", "critique", "revise", "scope", "slice", "acceptance", "brand", "artifact"],
          description: "Optional lens for workshop_document."
        },
        interview_focus: {
          type: "string",
          enum: ["problem", "stakeholders", "scope", "data", "slices", "acceptance", "ready"],
          description: "Optional area to focus interview questions on."
        }
      },
      required: ["mode"]
    }
  }
];

export const cooperToolNames = new Set(cooperToolDefinitions.map((tool) => tool.name));

export const operatorToolDefinitions = [
  {
    type: "function",
    name: "start_operator_task",
    description: "Start a supervised local Operator task that Michael can watch in the Operator workspace. Use this when Michael asks Cooper Operator to build artifacts, generate documents, create landing pages, create mini apps, run a Codex-style task, run browser work, use OpenAI Computer Use, debug a repo, inspect GitHub, connect to Codex through a supported bridge, or do SendGrid setup.",
    parameters: {
      type: "object",
      properties: {
        skill: {
          type: "string",
          enum: [
            "operator_document_suite",
            "aires_template_suite",
            "landing_page",
            "mini_app",
            "large_report",
            "html_prototype",
            "aires_requirements",
            "product_requirements",
            "mermaid_diagram",
            "sendgrid_sender_auth",
            "github_repo_debug",
            "computer_use_browser",
            "computer_use_desktop",
            "codex_app_server",
            "codex_mcp_agent",
            "openai_tool_stack_plan",
            "codex_local_planning"
          ],
          description: "The local Operator skill to run. Use operator_document_suite when Michael wants several work artifacts, aires_template_suite for all AIRES template docs, landing_page for marketing pages, mini_app for interactive single-file apps, html_prototype for product prototypes, computer_use_browser for visible browser UI automation, computer_use_desktop for supervised desktop UI automation, codex_app_server for supported Codex app-server/CLI control, codex_mcp_agent for multi-agent Codex orchestration, openai_tool_stack_plan for architecture decisions, and codex_local_planning for general Codex-style planning."
        },
        goal: {
          type: "string",
          description: "Specific outcome Michael wants from the Operator task. Include the context and success criteria in plain language."
        },
        target_url: {
          type: "string",
          description: "Optional URL the local browser task should open."
        },
        workspace_path: {
          type: "string",
          description: "Optional absolute local workspace path for Codex. Use the current configured workspace when Michael does not specify one."
        },
        codex_model: {
          type: "string",
          description: "Optional Codex model override. Omit it to use Michael's configured Codex default."
        },
        allowed_domains: {
          type: "array",
          items: { type: "string" },
          description: "Optional list of domains the local browser task may use."
        },
        artifact_kinds: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "post_call_kit",
              "execution_plan",
              "follow_up",
              "code_sketch",
              "product_requirements",
              "html_prototype",
              "mermaid_diagram",
              "ui_wireframe",
              "aires_requirements",
              "landing_page",
              "mini_app",
              "executive_report"
            ]
          },
          description: "Optional advanced override for exactly which Cooper artifact jobs to create."
        },
        template_ids: {
          type: "array",
          items: { type: "string" },
          description: "Optional AIRES template ids to generate, or ['all'] for the full AIRES template suite."
        }
      },
      required: ["skill", "goal"]
    }
  },
  {
    type: "function",
    name: "stop_operator_tasks",
    description: "Stop all active local Operator tasks immediately. Use when Michael says stop, kill, pause everything, cancel all, or end the Operator run.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Short reason Michael gave for stopping work."
        }
      }
    }
  },
  {
    type: "function",
    name: "cancel_operator_task",
    description: "Cancel one selected local Operator task. Use when Michael asks to cancel the current task or a specific task.",
    parameters: {
      type: "object",
      properties: {
        task_id: {
          type: "string",
          description: "Optional Operator task id. If omitted, cancel the currently selected or active task."
        },
        reason: {
          type: "string",
          description: "Short reason Michael gave for cancellation."
        }
      }
    }
  },
  {
    type: "function",
    name: "get_operator_task_status",
    description: "Inspect the selected, latest, or specified Operator task so Cooper can explain what happened, what is blocked, what artifacts exist, and what approval or next step is required.",
    parameters: {
      type: "object",
      properties: {
        task_id: {
          type: "string",
          description: "Optional Operator task id. If omitted, inspect the selected task, then active task, then most recent task."
        },
        include_logs: {
          type: "boolean",
          description: "Whether to include recent execution log entries. Defaults to true."
        },
        include_artifacts: {
          type: "boolean",
          description: "Whether to include generated artifact summaries. Defaults to true."
        }
      }
    }
  }
];

export const operatorToolNames = new Set(operatorToolDefinitions.map((tool) => tool.name));

export const computerUseToolDefinitions = [
  {
    type: "function",
    name: "open_chrome_tab",
    description: "Open a new Google Chrome tab on the local Mac. Use this before searching or when Michael asks for a fresh Chrome tab. Prints the tool call to the server terminal.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Optional URL. Omit or use about:blank for a blank tab."
        }
      }
    }
  },
  {
    type: "function",
    name: "search_web",
    description: "Open Chrome, type a search query into the address/search bar, and press Enter. Use when Michael asks to search, google, look up, or find something on the web. Prints the tool call to the server terminal.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The exact web search query."
        },
        browser: {
          type: "string",
          enum: ["chrome", "safari"],
          description: "Browser to use. Default to chrome unless Michael asks for Safari."
        }
      },
      required: ["query"]
    }
  },
  {
    type: "function",
    name: "click_link_with_vision",
    description: "Take a screenshot of the current page, ask a vision model to locate the link/result/button Michael describes, then click that screen location. Use when Michael says click a result, open that link, choose the Gmail item, or select a visible page element. Prints the tool call to the server terminal.",
    parameters: {
      type: "object",
      properties: {
        link_description: {
          type: "string",
          description: "Natural-language description of the visible link, result, button, or UI element to click."
        },
        min_confidence: {
          type: "number",
          description: "Optional confidence threshold from 0 to 1. Default 0.35."
        }
      },
      required: ["link_description"]
    }
  },
  {
    type: "function",
    name: "open_local_app",
    description: "Open an allow-listed local Mac app such as Google Chrome, Safari, Finder, Terminal, Claude Code, Codex, Spotify, Slack, Notion, or VS Code.",
    parameters: {
      type: "object",
      properties: {
        app_name: {
          type: "string",
          description: "The exact app name to open."
        }
      },
      required: ["app_name"]
    }
  },
  {
    type: "function",
    name: "open_web_app",
    description: "Open a common web app in Chrome or Safari, including Gmail, Google Drive, Google Docs, Google Sheets, Calendar, GitHub, Notion, Claude, or ChatGPT.",
    parameters: {
      type: "object",
      properties: {
        app: {
          type: "string",
          description: "Web app name, such as gmail, drive, docs, sheets, calendar, github, notion, claude, or chatgpt."
        },
        browser: {
          type: "string",
          enum: ["chrome", "safari"],
          description: "Browser to use. Default to chrome."
        },
        url: {
          type: "string",
          description: "Optional direct URL if the app is not in the shortcut list."
        }
      }
    }
  },
  {
    type: "function",
    name: "open_finder_location",
    description: "Open Finder to a local folder or file path.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Local file or folder path. Omit for the home folder."
        }
      }
    }
  },
  {
    type: "function",
    name: "open_terminal_workspace",
    description: "Open Terminal at a workspace path. Optionally execute a command only when execute or confirmed is true.",
    parameters: {
      type: "object",
      properties: {
        cwd: {
          type: "string",
          description: "Working directory to open in Terminal."
        },
        command: {
          type: "string",
          description: "Optional command. It will not run unless execute is true."
        },
        execute: {
          type: "boolean",
          description: "Set true only after Michael explicitly confirms command execution."
        }
      }
    }
  },
  {
    type: "function",
    name: "start_computer_use_task",
    description: "Start a supervised Cooper Computer Use task that can operate the local browser or desktop through the Computer Use workspace. Use this when Michael asks to open an app, open a website, download something, work in Claude Code/Codex, inspect a UI, or control the computer. Always route through approval-gated local execution.",
    parameters: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["desktop_app", "browser", "open_url", "download", "codex_desktop", "codex_bridge"],
          description: "The control lane. Use desktop_app for local apps such as Spotify, Claude, Claude Code, Slack, or Finder; browser/open_url/download for websites; codex_desktop for supervised UI control of Codex or Claude Code; codex_bridge for the supported Codex app-server/CLI bridge."
        },
        goal: {
          type: "string",
          description: "The exact outcome Michael wants, including success criteria and anything to avoid."
        },
        app_name: {
          type: "string",
          description: "Optional desktop app name to open or control, such as Spotify, Claude, Claude Code, Chrome, Slack, Notion, Finder, or Terminal."
        },
        target_url: {
          type: "string",
          description: "Optional URL to open, inspect, or download from."
        },
        target: {
          type: "string",
          description: "Optional human-readable target such as a file name, page name, button, document, repo, or destination."
        },
        allowed_domains: {
          type: "array",
          items: { type: "string" },
          description: "Optional domains the browser lane may use."
        }
      },
      required: ["mode", "goal"]
    }
  },
  {
    type: "function",
    name: "stop_computer_use_tasks",
    description: "Stop all active Cooper Computer Use tasks. Use when Michael says stop, stop computer use, cancel everything, pause the computer, or take hands off.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Short reason Michael gave for stopping the tasks."
        }
      }
    }
  },
  {
    type: "function",
    name: "cancel_computer_use_task",
    description: "Cancel one selected Cooper Computer Use task.",
    parameters: {
      type: "object",
      properties: {
        task_id: {
          type: "string",
          description: "Optional task id. If omitted, cancel the selected or active Computer Use task."
        },
        reason: {
          type: "string",
          description: "Short reason Michael gave for cancellation."
        }
      }
    }
  },
  {
    type: "function",
    name: "get_computer_use_status",
    description: "Inspect the selected, latest, or specified Cooper Computer Use task so the agent can report what is happening, what is blocked, which app/browser target is active, and what approval is needed.",
    parameters: {
      type: "object",
      properties: {
        task_id: {
          type: "string",
          description: "Optional task id. If omitted, inspect the selected task, then active Computer Use task, then most recent Computer Use task."
        },
        include_logs: {
          type: "boolean",
          description: "Whether to include recent execution logs. Defaults to true."
        }
      }
    }
  }
];

export const computerUseToolNames = new Set(computerUseToolDefinitions.map((tool) => tool.name));
