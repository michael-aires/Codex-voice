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
    description: "Use the AIRES Requirements Framework to explain its document library, workshop a selected framework document against provided context, run interview-style requirements discovery, or queue an AIRES-branded scoped requirements artifact from live meeting/project context.",
    parameters: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["list_framework", "explain_documents", "explain_document", "workshop_document", "interview", "queue_artifact"],
          description: "Use list_framework for a quick overview, explain_documents to explain all framework docs, explain_document for one doc, workshop_document to apply a selected doc to context/drafts, interview to ask context-gathering questions, and queue_artifact to create an AIRES scoped requirements HTML artifact."
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
    description: "Start a supervised local Operator task that Michael can watch in the Operator workspace. Use this when Michael asks Cooper Operator to build artifacts, generate documents, create landing pages, create mini apps, run a Codex-style task, run browser work, debug a repo, inspect GitHub, or do SendGrid setup.",
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
            "codex_local_planning"
          ],
          description: "The local Operator skill to run. Use operator_document_suite when Michael wants several work artifacts, aires_template_suite for all AIRES template docs, landing_page for marketing pages, mini_app for interactive single-file apps, html_prototype for product prototypes, and codex_local_planning for general Codex-style planning."
        },
        goal: {
          type: "string",
          description: "Specific outcome Michael wants from the Operator task. Include the context and success criteria in plain language."
        },
        target_url: {
          type: "string",
          description: "Optional URL the local browser task should open."
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
