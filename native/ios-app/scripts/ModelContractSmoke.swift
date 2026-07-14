import Foundation

@main
enum ModelContractSmoke {
    static func main() throws {
        let decoder = JSONDecoder()

        precondition(CooperWakePhrase.matches("Cooper, help me decide."))
        precondition(CooperWakePhrase.matches("Could we invite Cooper?"))
        precondition(!CooperWakePhrase.matches("Don't ask Cooper yet."))
        precondition(!CooperWakePhrase.matches("Cooper should never answer this."))
        precondition(!CooperWakePhrase.matches("The meeting is about product planning."))

        precondition(CooperRoute(url: URL(string: "cooper://today/daily-brief")!) == .dailyBrief)
        precondition(CooperRoute(url: URL(string: "cooper://sessions/legacy-call")!) == .session("legacy-call"))
        precondition(CooperRoute(url: CooperRoute.project("project-1").url) == .project("project-1"))
        precondition(CooperRoute(url: URL(string: "cooper://operator/tasks/operator-1?approval=approval-1")!) == .operatorTask(taskID: "operator-1", approvalID: "approval-1"))
        precondition(CooperRoute(url: CooperRoute.artifact("artifact-1").url) == .artifact("artifact-1"))
        precondition(CooperRoute(url: URL(string: "https://example.com/operator")!) == nil)
        precondition(CooperRoute(
            universalURL: URL(string: "https://cooper.example.com/open/operator/tasks/operator-1?approval=approval-1")!
        ) == .operatorTask(taskID: "operator-1", approvalID: "approval-1"))
        precondition(CooperRoute(
            universalURL: URL(string: "https://cooper.example.com/open/library/artifacts/artifact-1")!
        ) == .artifact("artifact-1"))

        let today = try decoder.decode(TodayResponse.self, from: Data(todayJSON.utf8))
        precondition(today.meetings.count == 1)
        precondition(today.meetings[0].time == "09:30")
        precondition(today.meetings[0].priority.isEmpty)
        precondition(today.meetings[0].conference.provider == "zoom")
        precondition(today.meetings[0].conference.meetingNumber == "123456789")
        precondition(today.meetings[0].conference.joinURL?.host == "zoom.us")
        precondition(today.tasks.count == 1)
        precondition(today.tasks[0].time.isEmpty)

        let dailyBrief = try decoder.decode(DailyBriefResponse.self, from: Data(dailyBriefJSON.utf8)).brief
        precondition(dailyBrief.id == "daily-brief-2026-07-14")
        precondition(dailyBrief.slides.map(\.id) == ["overview", "calendar", "sprint", "focus"])
        precondition(dailyBrief.assignment.matched == 1)
        precondition(dailyBrief.sessionFocus.type == "daily_brief")
        precondition(dailyBrief.contextText.contains("## Slide 4: A practical order for the day"))
        precondition(DailyBriefPresentation.slideIndex(
            slides: dailyBrief.slides,
            transcript: "Good morning. On your calendar: one meeting.",
            currentIndex: 0
        ) == 1)
        precondition(DailyBriefPresentation.slideIndex(
            slides: dailyBrief.slides,
            transcript: "On your calendar. In the sprint. Your focus for today is shipping.",
            currentIndex: 1
        ) == 3)
        precondition(DailyBriefPresentation.slideIndex(
            slides: dailyBrief.slides,
            transcript: "On your calendar",
            currentIndex: 2
        ) == 2)

        let calls = try decoder.decode(CallsResponse.self, from: Data(callsJSON.utf8))
        precondition(calls.calls.count == 1)
        precondition(calls.calls[0].transcript.first?.speaker == "Michael")
        precondition(calls.calls[0].threadId == "legacy-call")
        precondition(calls.calls[0].contextPacketId == "packet-1")
        precondition(calls.calls[0].contextSourceCount == 1)

        let discovery = try decoder.decode(ArcadeDiscovery.self, from: Data(discoveryJSON.utf8))
        precondition(discovery.configured == false)
        precondition(discovery.services.isEmpty)
        precondition(discovery.error == "Missing ARCADE_API_KEY.")

        let resume = try decoder.decode(ResumeResponse.self, from: Data(resumeJSON.utf8))
        precondition(resume.resumePacket.sourceCallId == "legacy-call")
        precondition(resume.resumePacket.openQuestions.first?.text == "Who owns the fallback queue?")
        precondition(resume.resumePacket.nextActions.first?.speaker.isEmpty == true)

        let context = try decoder.decode(ContextPacketResponse.self, from: Data(contextJSON.utf8))
        precondition(context.packet.sourceCount == 1)
        precondition(context.packet.sources.first?.locked == false)
        precondition(context.packet.sources.first?.resolutionStatus == "completed")
        precondition(context.sessionContext.contains("Evidence packet"))

        let state = try decoder.decode(ProjectStateResponse.self, from: Data(projectStateJSON.utf8))
        precondition(state.projects.first?.sourceCount == 1)
        precondition(state.projects.first?.sources.first?.storedCharCount == 8400)
        precondition(state.projects.first?.lastUsedAt == nil)
        precondition(state.contextPackets.first?.intent == "Verify native parity.")
        precondition(state.artifacts.first?.fileExtension == "html")
        precondition(state.artifacts.first?.isHTML == true)
        precondition(state.artifacts.first?.isTextArtifact == true)
        var pdfArtifact = state.artifacts[0]
        pdfArtifact.outputType = "pdf"
        pdfArtifact.fileExtension = ".PDF"
        pdfArtifact.mimeType = "application/pdf"
        precondition(pdfArtifact.normalizedFileExtension == "pdf")
        precondition(pdfArtifact.prefersNativePreview == true)
        precondition(pdfArtifact.systemImageName == "doc.richtext")
        let docxArtifact = try decoder.decode(ArtifactRecord.self, from: Data(#"{"id":"word-1","outputType":"docx","title":"Word brief"}"#.utf8))
        precondition(docxArtifact.fileExtension == "docx")
        precondition(docxArtifact.mimeType == "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        precondition(docxArtifact.prefersNativePreview == true)
        precondition(docxArtifact.systemImageName == "doc.text")
        let pptxArtifact = try decoder.decode(ArtifactRecord.self, from: Data(#"{"id":"deck-1","outputType":"pptx","title":"Decision deck"}"#.utf8))
        precondition(pptxArtifact.fileExtension == "pptx")
        precondition(pptxArtifact.mimeType == "application/vnd.openxmlformats-officedocument.presentationml.presentation")
        precondition(pptxArtifact.prefersNativePreview == true)
        precondition(pptxArtifact.systemImageName == "rectangle.on.rectangle.angled")
        let xlsxArtifact = try decoder.decode(ArtifactRecord.self, from: Data(#"{"id":"register-1","outputType":"xlsx","title":"Action register"}"#.utf8))
        precondition(xlsxArtifact.fileExtension == "xlsx")
        precondition(xlsxArtifact.mimeType == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        precondition(xlsxArtifact.prefersNativePreview == true)
        precondition(xlsxArtifact.systemImageName == "tablecells")
        precondition(state.jobs.first?.isActive == true)
        let toolCall = try decoder.decode(ToolCallRecord.self, from: Data(#"{"id":"tool-1","toolName":"search_notion_workspace","riskLevel":"read","status":"completed","resultSummary":"Found the source."}"#.utf8))
        precondition(toolCall.isSuccessful == true)
        precondition(toolCall.resultSummary == "Found the source.")
        precondition((state.jobs.first?.progressFraction ?? 0) > 0)
        precondition(state.recipes.first?.stepCount == 3)
        precondition(ArtifactRecipe.previews.contains { $0.kind == "pdf_brief" && $0.outputType == "pdf" })
        precondition(ArtifactRecipe.previews.contains { $0.kind == "word_brief" && $0.outputType == "docx" })
        precondition(ArtifactRecipe.previews.contains { $0.kind == "powerpoint_deck" && $0.outputType == "pptx" })
        precondition(ArtifactRecipe.previews.contains { $0.kind == "excel_action_register" && $0.outputType == "xlsx" })

        let liveContext = try decoder.decode(
            LiveSessionContextResponse.self,
            from: Data(liveContextJSON.utf8)
        )
        precondition(liveContext.call.projectId == "project-live")
        precondition(liveContext.project?.sources.first?.sourceType == "live_call")
        precondition(liveContext.sessionContext.contains("Release gate"))
        let realtimeSession = liveContext.realtimeSession.foundationValue as? [String: Any]
        precondition(realtimeSession?["type"] as? String == "realtime")
        precondition((realtimeSession?["tools"] as? [Any])?.count == 1)

        let examples = try decoder.decode(AiresExamplesResponse.self, from: Data(airesExamplesJSON.utf8))
        precondition(examples.examples.first?.id == "scoped_requirements_rep_velocity")
        precondition(examples.examples.first?.recipeKind == "aires_requirements")
        precondition(examples.examples.first?.html.isEmpty == true)

        let operatorState = try decoder.decode(OperatorStateResponse.self, from: Data(operatorStateJSON.utf8))
        precondition(operatorState.tasks.first?.status == "waiting_approval")
        precondition(operatorState.tasks.first?.pendingApprovals.count == 1)
        precondition(operatorState.tasks.first?.generatedJobList.isEmpty == true)
        precondition(operatorState.presets.first?.isComputerUse == true)
        precondition(operatorState.runtime.computerUseEnabled == true)
        precondition(operatorState.limits.approvalQueue == 1)

        var operatorBeforeApproval = operatorState.tasks[0]
        operatorBeforeApproval.status = "running"
        operatorBeforeApproval.approvals = []
        let approvalAlerts = CooperNotificationPlanner.operatorAlerts(
            from: [operatorBeforeApproval],
            to: operatorState.tasks
        )
        precondition(approvalAlerts.count == 1)
        precondition(approvalAlerts[0].route == .operatorTask(taskID: "operator-1", approvalID: "approval-1"))
        precondition(CooperNotificationPlanner.operatorAlerts(
            from: operatorState.tasks,
            to: operatorState.tasks
        ).isEmpty)

        var completedOperatorTask = operatorBeforeApproval
        completedOperatorTask.status = "completed"
        let operatorCompletedAlerts = CooperNotificationPlanner.operatorAlerts(
            from: [operatorBeforeApproval],
            to: [completedOperatorTask]
        )
        precondition(operatorCompletedAlerts.count == 1)
        precondition(operatorCompletedAlerts[0].route == .operatorTask(taskID: "operator-1", approvalID: nil))

        var failedOperatorTask = operatorBeforeApproval
        failedOperatorTask.status = "failed"
        failedOperatorTask.error = "The supervised browser stopped."
        let operatorFailedAlerts = CooperNotificationPlanner.operatorAlerts(
            from: [operatorBeforeApproval],
            to: [failedOperatorTask]
        )
        precondition(operatorFailedAlerts.count == 1)
        precondition(operatorFailedAlerts[0].body.contains("supervised browser stopped"))

        var completedJob = state.jobs[0]
        completedJob.status = "completed"
        completedJob.artifactId = "artifact-1"
        let artifactAlerts = CooperNotificationPlanner.artifactAlerts(
            from: state.jobs,
            to: [completedJob],
            artifacts: state.artifacts
        )
        precondition(artifactAlerts.count == 1)
        precondition(artifactAlerts[0].route == .artifact("artifact-1"))

        var failedJob = state.jobs[0]
        failedJob.status = "failed"
        failedJob.error = "Response timed out."
        let artifactFailedAlerts = CooperNotificationPlanner.artifactAlerts(
            from: state.jobs,
            to: [failedJob],
            artifacts: state.artifacts
        )
        precondition(artifactFailedAlerts.count == 1)
        precondition(artifactFailedAlerts[0].route == .library)
        precondition(artifactFailedAlerts[0].body.contains("Response timed out"))

        var usage = RealtimeUsage()
        usage.addResponse(RealtimeUsageTotals(
            totalTokens: 250,
            inputTokens: 150,
            outputTokens: 100,
            inputTextTokens: 50,
            inputAudioTokens: 100,
            outputAudioTokens: 100
        ))
        usage.addTranscription(RealtimeUsageTotals(totalTokens: 40, inputTokens: 32, outputTokens: 8))
        precondition(usage.totalTokens == 290)
        precondition(usage.responses == 1)
        precondition(usage.transcriptionEvents == 1)
        precondition(usage.costUsd > 0)

        print("Cooper iOS model contract smoke passed.")
    }

    private static let todayJSON = #"""
    {
      "updatedAt":"2026-07-14T16:05:00Z",
      "expiresAt":"2026-07-14T16:10:00Z",
      "timeZone":"America/Vancouver",
      "date":"2026-07-14",
      "meetings":[{
        "id":"calendar-1","targetId":"1","type":"meeting","time":"09:30","duration":"45 min",
        "startsAt":"2026-07-14T09:30:00-07:00","endsAt":"2026-07-14T10:15:00-07:00",
        "title":"Roadmap","subtitle":"AIRES","source":"Google Calendar","sourceLabel":"Google Calendar",
        "eyebrow":"Jul 14, 9:30 AM","status":"next","description":"Review roadmap.","points":[],"docs":[],
        "url":"https://calendar.google.com/event?eid=1","actionLabel":"Join with Cooper","actionNote":"Prepared.","callIntro":"Ready.","prompt":"Join.",
        "conference":{"provider":"zoom","source":"calendar","joinUrl":"https://zoom.us/j/123456789?pwd=secret","meetingNumber":"123456789","password":"secret"}
      }],
      "tasks":[{
        "id":"notion-1","targetId":"1","type":"task","title":"Ship iOS","subtitle":"AIRES-421",
        "source":"notion · Sprint 14","sourceLabel":"Sprint 14","eyebrow":"AIRES-421","status":"In progress",
        "priority":"active","description":"Connected foundation.","points":[],"docs":[],"url":"",
        "actionLabel":"Work with Cooper","actionNote":"Prepared.","callIntro":"Ready.","prompt":"Help."
      }],
      "projects":[],"sessions":[],"sprint":null,
      "sources":{
        "calendar":{"status":"connected","label":"Google Calendar","count":1,"message":"Loaded."},
        "notion":{"status":"connected","label":"Notion Sprint Board","count":1,"message":"Loaded."},
        "projects":{"status":"connected","label":"Cooper projects","count":0,"message":"None."},
        "sessions":{"status":"connected","label":"Cooper sessions","count":0,"message":"None."}
      }
    }
    """#

    private static let callsJSON = #"""
    {"calls":[{
      "id":"legacy-call","title":"Legacy session","status":"ended","startedAt":"2026-07-13T23:10:00Z",
      "durationSeconds":60,"contextPacketId":"packet-1","contextSourceCount":1,
      "transcript":[{"id":"turn-1","speaker":"Michael","text":"Hello"}]
    }]}
    """#

    private static let dailyBriefJSON = #"""
    {
      "brief":{
        "id":"daily-brief-2026-07-14","type":"daily_brief","date":"2026-07-14",
        "dateLabel":"Tuesday, July 14","timeZone":"America/Vancouver",
        "generatedAt":"2026-07-14T14:00:00Z","trigger":"startup","title":"Daily Catch Up",
        "summary":"Today has one meeting and one assigned ticket.",
        "highlights":["Next: 09:30 · Roadmap","1 open sprint ticket in your brief."],
        "meetings":[{"id":"calendar-1","type":"meeting","title":"Roadmap","time":"09:30","duration":"45 min","status":"next"}],
        "tasks":[{"id":"notion-1","type":"task","title":"Ship iOS","status":"In progress"}],
        "sprint":null,
        "slides":[
          {"id":"overview","eyebrow":"Tuesday, July 14","title":"Your day, in one view","narrative":"One meeting and one ticket.","voiceCue":"Good morning. Here's your daily update.","narration":"Good morning. Here's your daily update. One meeting and one ticket.","metrics":[{"label":"Meetings","value":"1"}],"items":[]},
          {"id":"calendar","eyebrow":"Calendar","title":"The rooms you need to be in","narrative":"Your connected calendar.","voiceCue":"On your calendar","narration":"On your calendar: one meeting.","metrics":[],"items":[{"lead":"09:30","title":"Roadmap","detail":"45 min","status":"next"}]},
          {"id":"sprint","eyebrow":"Sprint 14","title":"Work assigned to Michael","narrative":"One matched ticket.","voiceCue":"In the sprint","narration":"In the sprint: one assigned ticket.","metrics":[],"items":[{"lead":"AIRES-421","title":"Ship iOS","detail":"In progress","status":"In motion"}]},
          {"id":"focus","eyebrow":"Recommended focus","title":"A practical order for the day","narrative":"A suggested sequence.","voiceCue":"Your focus for today","narration":"Your focus for today is shipping iOS.","metrics":[],"items":[]}
        ],
        "assignment":{"mode":"matched","selectors":["Michael Moll"],"matched":1,"available":1,"message":"Filtered the active sprint to one ticket."},
        "sources":{
          "calendar":{"status":"connected","label":"Google Calendar","count":1,"message":"Loaded."},
          "notion":{"status":"connected","label":"Notion Sprint Board","count":1,"message":"Loaded."},
          "projects":{"status":"connected","label":"Cooper projects","count":0,"message":"None."},
          "sessions":{"status":"connected","label":"Cooper sessions","count":0,"message":"None."}
        },
        "voicePrompt":"Present these four lines in order."
      }
    }
    """#

    private static let discoveryJSON = #"""
    {"configured":false,"userId":"michael","gatewayUrl":null,"services":[],"error":"Missing ARCADE_API_KEY."}
    """#

    private static let resumeJSON = #"""
    {
      "call":{"id":"legacy-call","title":"Legacy session","status":"ended","transcript":[]},
      "resumePacket":{
        "version":1,"sourceCallId":"legacy-call","rootCallId":"legacy-call","title":"Legacy session",
        "summary":"Continue the mobile evidence boundary.",
        "openQuestions":[{"text":"Who owns the fallback queue?"}],
        "nextActions":[{"text":"Verify the continuation path."}],
        "recentTurns":[{"speaker":"Michael","text":"Keep the boundary explicit."}],
        "artifacts":[],"activeWork":[]
      }
    }
    """#

    private static let contextJSON = #"""
    {
      "packet":{
        "id":"packet-1","intent":"Verify native parity.","sourceCount":1,
        "contextPreview":"Evidence packet preview.",
        "sources":[{
          "id":"page-1","provider":"notion","type":"page","title":"iOS parity",
          "resolutionStatus":"completed"
        }]
      },
      "sessionContext":"# Evidence packet\nResolved Notion context."
    }
    """#

    private static let projectStateJSON = #"""
    {
      "calls":[],
      "projects":[{
        "id":"project-1","title":"Cooper iOS parity","status":"active","sourceCount":1,"totalChars":8400,
        "sources":[{
          "id":"source-1","projectId":"project-1","title":"iOS roadmap","sourceType":"markdown",
          "storedCharCount":8400,"preview":"Milestone sequence."
        }]
      }],
      "contextPackets":[{
        "id":"packet-1","intent":"Verify native parity.","sourceCount":1,
        "contextPreview":"Bounded evidence.",
        "sources":[{"id":"page-1","provider":"notion","type":"page","title":"iOS parity","resolutionStatus":"completed"}]
      }],
      "artifacts":[{
        "id":"artifact-1","callId":"legacy-call","jobId":"job-1","kind":"executive_report",
        "title":"Shared context brief","workstream":"session_preparation","outputType":"html",
        "extension":"html","mimeType":"text/html","file":"data/artifacts/artifact-1.html",
        "createdAt":"2026-07-14T17:00:00Z"
      }],
      "jobs":[{
        "id":"job-1","callId":"legacy-call","kind":"executive_report","title":"Shared context brief",
        "workstream":"session_preparation","status":"running","stepIndex":1,"stepCount":3,
        "activeStepSummary":"Structuring the evidence brief","progress":"Step 2 of 3.",
        "logs":[{"at":"2026-07-14T17:01:00Z","type":"step","message":"Drafting."}]
      }],
      "recipes":[{"kind":"executive_report","title":"Executive report","outputType":"html","stepCount":3}]
    }
    """#

    private static let airesExamplesJSON = #"""
    {
      "examples":[{
        "id":"scoped_requirements_rep_velocity","title":"Scoped requirements: rep velocity",
        "category":"Requirements","flow":"Turn opportunity into scoped work.",
        "description":"Canonical AIRES example.","recipeKind":"aires_requirements",
        "promptHint":"Generate scoped requirements."
      }]
    }
    """#

    private static let liveContextJSON = #"""
    {
      "call":{
        "id":"call-live","title":"Release readiness","status":"active",
        "projectId":"project-live","projectTitle":"Live Cooper context"
      },
      "project":{
        "id":"project-live","title":"Live Cooper context","description":"Context added during an active call.",
        "status":"active","sourceCount":1,"totalChars":42,
        "sources":[{
          "id":"source-live","projectId":"project-live","title":"Release gate",
          "sourceType":"live_call","storedCharCount":42,"preview":"Ship only after device QA."
        }]
      },
      "projectContext":"# Active Project Context\n\n## Source: Release gate",
      "sessionContext":"# Cooper Loaded Session Context\n\nRelease gate",
      "realtimeSession":{
        "type":"realtime","instructions":"Use the loaded release gate.",
        "tools":[{"type":"function","name":"search_workspace_context"}]
      }
    }
    """#

    private static let operatorStateJSON = #"""
    {
      "runtime":{
        "mode":"local","browserProfile":"/tmp/operator","codexWorkspace":"/tmp/workspace",
        "codexRuntime":"codex exec","visibleBrowser":true,"browserLaunchEnabled":true,
        "computerUseEnabled":true,"computerUseBridge":"local","codexAppServerEnabled":true,
        "codexMcpEnabled":false,"agentsSdkEnabled":true,"sandboxAgentsEnabled":false,
        "defaultAllowedDomains":["github.com"],
        "budgets":{"maxSteps":40,"maxCodexInvocations":3,"maxWallClockMs":900000}
      },
      "presets":[{
        "id":"computer_use_browser","title":"Computer Use browser harness",
        "description":"Run a supervised browser task.","targetUrl":"",
        "defaultDomains":[],"riskLevel":"write","harness":"computer_use",
        "openaiTools":["responses","computer_use"]
      }],
      "tasks":[{
        "id":"operator-1","title":"Inspect release state","goal":"Inspect without writes.",
        "skill":"computer_use_browser","targetUrl":"https://github.com/aires-tech",
        "allowedDomains":["github.com"],"riskLevel":"write","artifactKinds":[],"templateIds":[],
        "computerIntent":{"mode":"browser","appName":"","target":"release state","targetUrl":"https://github.com/aires-tech","requestedBy":"Michael"},
        "relatedCallId":"","jobIds":[],"jobsQueuedAt":"","status":"waiting_approval",
        "budgets":{"maxSteps":40,"maxCodexInvocations":3,"maxWallClockMs":900000},
        "steps":["Prepare browser.","Pause for approval."],"stepIndex":1,"codexInvocations":0,
        "approvals":[{
          "id":"approval-1","type":"browser_launch","title":"Open browser",
          "description":"Approve the visible browser launch.","status":"pending",
          "requestedAt":"2026-07-14T18:00:00Z","resolvedAt":""
        }],
        "artifacts":[],
        "logs":[{
          "id":"log-1","type":"approval.required","title":"Approval required",
          "detail":"Paused before browser launch.","at":"2026-07-14T18:00:00Z"
        }],
        "createdAt":"2026-07-14T17:59:00Z","updatedAt":"2026-07-14T18:00:00Z",
        "startedAt":"2026-07-14T17:59:30Z","completedAt":"","stoppedAt":"","error":"","progress":50
      }],
      "activeTask":null,
      "limits":{"activeTasks":1,"approvalQueue":1}
    }
    """#
}
