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
