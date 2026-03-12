import { useEffect, useRef, useState, useCallback } from "react"

export interface ChatbotConfig {
    apiBase: string
    publicId: string
    originDomain: string
    name: string
    avatar: string
    primaryColor: string
    secondaryColor: string
    inputPlaceholder: string
    welcomeMessage?: string
    welcomeDelay?: number
    showWelcomeOnMobile?: boolean
    position?: "bottom-right" | "bottom-left" | "middle-right"
}

interface MediaItem {
    type: "image" | "video"
    url: string
}

interface LinkAction {
    type: "link" | "email" | "phone" | "whatsapp"
    title?: string
    value: string
    new_tab?: boolean
}

interface Option {
    label: string
    value?: string
}

interface ChatNode {

    session_id?: string
    node_id?: string

    node_type?: string
    type?: string

    content?: string

    typing_time?: number

    input_type?: string

    validation_error?: boolean
    message?: string

    options?: Option[]
    policy?: Option[]

    media?: MediaItem[]
    link_actions?: LinkAction[]

    auto_next?: boolean

    end_conversation?: boolean
    completed?: boolean
}

const TEXT_INPUT_TYPES = ["question", "email", "phone", "number"]

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */

const getVisitorId = () => {
    const key = "chat_visitor_id"
    let id = localStorage.getItem(key)
    if (!id) {
        id = crypto.randomUUID()
        localStorage.setItem(key, id)
    }
    return id
}

const getTime = () =>
    new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })

const rgb = (hex: string) => {
    if (!/^#[\da-f]{6}$/i.test(hex)) return "37,99,235"
    return `${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5), 16)}`
}

/** Aclara un color hex sumando `amount` a cada canal (0–255) */
const lighten = (hex: string, amount: number): string => {
    if (!/^#[\da-f]{6}$/i.test(hex)) return hex
    const clamp = (n: number) => Math.min(255, Math.max(0, n))
    const r = clamp(parseInt(hex.slice(1, 3), 16) + amount)
    const g = clamp(parseInt(hex.slice(3, 5), 16) + amount)
    const b = clamp(parseInt(hex.slice(5), 16) + amount)
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`
}

/** Oscurece un color hex restando `amount` a cada canal */
const darken = (hex: string, amount: number): string => lighten(hex, -amount)

/* ─────────────────────────────────────────
   HOOK
───────────────────────────────────────── */
export function useChatbot(config: ChatbotConfig | null) {

    /* ── REFS — siempre primero, sin condiciones ── */
    const messagesRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const startedRef = useRef(false)
    const sessionIdRef = useRef<string | null>(null)
    const typingRef = useRef<HTMLDivElement | null>(null)
    const sendingRef = useRef(false)
    const isOpenRef = useRef(false)

    /* ── STATE — siempre, sin condiciones ── */
    const [isOpen, setIsOpen] = useState(false)
    const [sessionId, setSessionId] = useState<string | null>(() => {
        if (!config) return null
        return localStorage.getItem(`chat_session_${config?.publicId}`) ?? null
    })
    const [inputDisabled, setInputDisabled] = useState(true)
    const [sendDisabled, setSendDisabled] = useState(true)
    const [statusText, setStatusText] = useState("Conectando...")
    const [viewerOpen, setViewerOpen] = useState(false)
    const [viewerUrl, setViewerUrl] = useState("")
    const [viewerIsVideo, setViewerIsVideo] = useState(false)
    const [welcomeVisible, setWelcomeVisible] = useState(false)

    /* ── EFFECTS — siempre declarados, guard interno con config ── */

    // Sync sessionId ref
    useEffect(() => {
        sessionIdRef.current = sessionId
    }, [sessionId])

    // Apply theme CSS vars — incluyendo light y dark dinámicos
    useEffect(() => {
        if (!config) return
        const p = config.primaryColor
        const s = config.secondaryColor
        document.documentElement.style.setProperty("--chat-primary",       p)
        document.documentElement.style.setProperty("--chat-primary-light", lighten(p, 28))
        document.documentElement.style.setProperty("--chat-primary-dark",  darken(p, 22))
        document.documentElement.style.setProperty("--chat-primary-rgb",   rgb(p))
        document.documentElement.style.setProperty("--chat-secondary",     s)
    }, [config?.primaryColor, config?.secondaryColor])

    // Welcome message
    useEffect(() => {
        if (!config?.welcomeMessage) return
        const welcomeKey = `chat_welcome_seen_${config.publicId}`
        const isMobile = matchMedia("(max-width:480px)").matches

        if (!localStorage.getItem(welcomeKey)) {
            const delay = (config.welcomeDelay ?? 2) * 1000
            const timer = setTimeout(() => {
                if (!isOpen && (!isMobile || config.showWelcomeOnMobile)) {
                    setWelcomeVisible(true)
                    localStorage.setItem(welcomeKey, "1")
                }
            }, delay)
            return () => clearTimeout(timer)
        }
    }, [
        config?.publicId,
        config?.welcomeMessage,
        config?.welcomeDelay,
        config?.showWelcomeOnMobile
    ])

    /* ── Scroll to bottom ── */
    const scrollToBottom = useCallback(() => {
        requestAnimationFrame(() => {
            if (messagesRef.current) {
                messagesRef.current.scrollTop = messagesRef.current.scrollHeight
            }
        })
    }, [])

    /* ── Typing indicator ── */
    const showTyping = useCallback(() => {
        if (typingRef.current || !messagesRef.current) return
        const el = document.createElement("div")
        el.className = "msg bot typing"
        el.innerHTML = `
      <img src="${config?.avatar ?? ""}" class="msg-avatar" />
      <div class="msg-content">
        <div class="bubble">
          <span class="typing-dots"><span></span><span></span><span></span></span>
        </div>
      </div>`
        messagesRef.current.appendChild(el)
        typingRef.current = el
        scrollToBottom()
    }, [config?.avatar, scrollToBottom])

    const hideTyping = useCallback(() => {
        typingRef.current?.remove()
        typingRef.current = null
    }, [])

    /* ── Disable / Enable input ── */
    const disableInput = useCallback(() => {
        setInputDisabled(true)
        setSendDisabled(true)
    }, [])

    const enableInput = useCallback(() => {
        setInputDisabled(false)
        setSendDisabled(false)
        setTimeout(() => inputRef.current?.focus(), 50)
    }, [])

    const configureInput = useCallback((type: string) => {
        if (!inputRef.current) return
        inputRef.current.type = "text"
        inputRef.current.placeholder = config?.inputPlaceholder ?? "Escribe tu mensaje..."

        if (type === "email") {
            inputRef.current.type = "email"
            inputRef.current.placeholder = "correo@ejemplo.com"
        } else if (type === "phone") {
            inputRef.current.type = "tel"
            inputRef.current.placeholder = "Ej. +52 999 123 4567"
        } else if (type === "number") {
            inputRef.current.type = "number"
        }
    }, [config?.inputPlaceholder])

    /* ── Append plain message ── */
    const appendMessage = useCallback((from: "user" | "bot", text: string, error = false) => {
        if (!messagesRef.current) return
        const m = document.createElement("div")
        m.className = `msg ${from}${error ? " error" : ""}`

        if (from === "bot") {
            const a = document.createElement("img")
            a.src = config?.avatar ?? ""
            a.className = "msg-avatar"
            m.appendChild(a)
        }

        const c = document.createElement("div")
        c.className = "msg-content"

        const b = document.createElement("div")
        b.className = "bubble"
        b.textContent = text

        const t = document.createElement("div")
        t.className = "message-time"
        t.textContent = getTime()

        c.append(b, t)
        m.appendChild(c)
        messagesRef.current.appendChild(m)
        scrollToBottom()
    }, [config?.avatar, scrollToBottom])

    /* ── Render bot bubble with HTML ── */
    const renderBotMessage = useCallback((html: string): HTMLDivElement => {
        const m = document.createElement("div")
        m.className = "msg bot"

        const avatarImg = document.createElement("img")
        avatarImg.src = config?.avatar ?? ""
        avatarImg.className = "msg-avatar"

        const contentWrapper = document.createElement("div")
        contentWrapper.className = "msg-content"

        const bubble = document.createElement("div")
        bubble.className = "bubble"
        bubble.innerHTML = html

        const timeEl = document.createElement("div")
        timeEl.className = "message-time"
        timeEl.textContent = getTime()

        contentWrapper.append(bubble, timeEl)
        m.append(avatarImg, contentWrapper)
        messagesRef.current?.appendChild(m)
        scrollToBottom()

        return bubble
    }, [config?.avatar, scrollToBottom])

    /* ── Image / Video viewer ── */
    const openImageViewer = useCallback((url: string) => {
        setViewerIsVideo(false)
        setViewerUrl(url)
        setViewerOpen(true)
    }, [])

    const openVideoViewer = useCallback((url: string) => {
        setViewerIsVideo(true)
        setViewerUrl(url)
        setViewerOpen(true)
    }, [])

    const closeViewer = useCallback(() => {
        setViewerOpen(false)
        setViewerUrl("")
    }, [])

    /* ── Link actions ── */
    const renderLinkActions = useCallback((actions: LinkAction[], bubble: HTMLDivElement) => {

        const container = document.createElement("div")
        container.className = "link-actions"

        actions.forEach(action => {

            const a = document.createElement("a")
            a.className = `link-action link-${action.type}`
            a.textContent = action.title || action.value

            const target = "_blank"
            switch (action.type) {

                case "link":
                    a.href = action.value
                    break
                case "email": {

                    const email = action.value.trim()

                    const chatbotName = config?.name || "Chatbot"

                    const subject = encodeURIComponent(`Contacto desde chatbot: ${chatbotName}`)

                    const body = encodeURIComponent(
                        `Hola,

                        Estoy contactando desde el chatbot "${chatbotName}".

                        Quiero más información.

                        Gracias.`)

                    const gmailURL =
                        `https://mail.google.com/mail/?view=cm&fs=1&to=${email}&su=${subject}&body=${body}`

                    const mailtoURL =
                        `mailto:${email}?subject=${subject}&body=${body}`

                    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

                    a.href = isMobile ? mailtoURL : gmailURL
                    break
                }
                case "phone":
                    a.href = `tel:${action.value}`
                    break
                case "whatsapp":
                    const phone = action.value.replace(/\D/g, "")
                    const fullPhone = phone.startsWith("52") ? phone : `52${phone}`
                    a.href = `https://api.whatsapp.com/send?phone=${fullPhone}`
                    break

                default:
                    return
            }

            a.target = target

            if (target === "_blank") {
                a.rel = "noopener noreferrer"
            }

            container.appendChild(a)

        })

        bubble.appendChild(container)

    }, [config])

    /* ── Media carousel ── */
    const renderMediaCarousel = useCallback((mediaList: MediaItem[], bubbleElement: HTMLDivElement) => {
        const msgEl = bubbleElement.closest(".msg.bot")
        if (msgEl) msgEl.classList.add("media-msg")

        const wrapper = document.createElement("div")
        wrapper.className = "media-carousel-wrapper"

        const MAX_VISIBLE = 4
        const total = mediaList.length
        const extra = total - MAX_VISIBLE

        let countClass = "count-1"
        if (total === 2) countClass = "count-2"
        else if (total === 3) countClass = "count-3"
        else if (total === 4) countClass = "count-4"
        else if (total > 4) countClass = "count-more"

        const grid = document.createElement("div")
        grid.className = `media-grid ${countClass}`

        mediaList.slice(0, MAX_VISIBLE).forEach((media, index) => {
            const item = document.createElement("div")
            item.className = "media-item"

            const isLast = index === MAX_VISIBLE - 1
            if (isLast && extra > 0) {
                item.classList.add("has-more-overlay")
                item.dataset.more = `+${extra}`
            }

            if (media.type === "image") {
                const img = document.createElement("img")
                img.src = media.url
                img.loading = "lazy"
                item.onclick = () => openImageViewer(media.url)
                item.appendChild(img)
            }

            if (media.type === "video") {
                const video = document.createElement("video")
                video.src = media.url
                video.playsInline = true
                video.muted = true
                video.preload = "metadata"

                if (total === 1) {
                    video.controls = true
                    item.appendChild(video)
                } else {
                    video.controls = false
                    item.appendChild(video)

                    const playOverlay = document.createElement("div")
                    playOverlay.className = "video-play-overlay"
                    playOverlay.innerHTML = `
            <svg viewBox="0 0 48 48" width="44" height="44">
              <circle cx="24" cy="24" r="24" fill="rgba(0,0,0,0.5)"/>
              <polygon points="19,14 38,24 19,34" fill="white"/>
            </svg>`
                    item.appendChild(playOverlay)
                    item.style.cursor = "pointer"
                    item.onclick = () => openVideoViewer(media.url)
                }
            }

            grid.appendChild(item)
        })

        wrapper.appendChild(grid)
        bubbleElement.appendChild(wrapper)
        scrollToBottom()
    }, [openImageViewer, openVideoViewer, scrollToBottom])

    /* ── Inline options / policy ── */
    const renderInlineOptions = useCallback((node: ChatNode, bubbleElement: HTMLDivElement, sendFn: (v: string) => void) => {
        const list = (node.node_type === "policy" || node.type === "policy")
            ? node.policy!
            : node.options!

        const optionsContainer = document.createElement("div")
        optionsContainer.className = "inline-options"

        list.forEach(o => {
            const btn = document.createElement("button")
            btn.textContent = o.label
            btn.onclick = () => {
                optionsContainer.querySelectorAll("button").forEach(b => {
                    (b as HTMLButtonElement).disabled = true;
                    (b as HTMLButtonElement).style.opacity = "0.5";
                    (b as HTMLButtonElement).style.cursor = "not-allowed";
                    (b as HTMLButtonElement).style.pointerEvents = "none"
                })
                disableInput()
                sendFn(o.value ?? o.label)
            }
            optionsContainer.appendChild(btn)
        })

        bubbleElement.appendChild(optionsContainer)
    }, [disableInput])

    /* ── Core process function ── */
    const process = useCallback(async (node: ChatNode, depth = 0, sendFn: (v: string) => void): Promise<void> => {
        if (!node || depth > 50 || !config) return

        const nodeType = node.node_type || node.type

        if (node.validation_error) {
            hideTyping()
            appendMessage("bot", node.message || "Error de validación", true)
            const inputType = node.input_type || node.type || "question"
            configureInput(inputType)
            enableInput()
            return
        }

        if (node.typing_time && node.typing_time > 0) {
            showTyping()
            scrollToBottom()
            await new Promise(r => setTimeout(r, node.typing_time! * 1000))
            hideTyping()
        }

        // ── HELPER: avanzar al siguiente nodo automáticamente ──
        const autoAdvance = async () => {
            try {
                const sid = sessionIdRef.current
                if (!sid) return
                const r = await fetch(
                    `${config.apiBase}/api/public-chatbot/chatbot-conversation/${sid}/next`,
                    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }
                )
                const nextNode: ChatNode = await r.json()

                if (!nextNode || nextNode.completed) {
                    disableInput()
                    return
                }

                return process(nextNode, depth + 1, sendFn)

            } catch {
                appendMessage("bot", "Error al continuar el flujo.", true)
            }
        }

        if (nodeType === "link") {
            const bubbleElement = renderBotMessage(node.content || "")
            if (node.link_actions?.length) {
                renderLinkActions(node.link_actions, bubbleElement)
            }
            if (node.end_conversation) {
                disableInput()
                return
            }
            await autoAdvance()
            return
        }

        let bubbleElement: HTMLDivElement
        if (node.content) {
            bubbleElement = renderBotMessage(node.content)
        } else {
            bubbleElement = renderBotMessage("")
            bubbleElement.classList.add("media-only")
        }

        if (nodeType === "media" && Array.isArray(node.media)) {
            renderMediaCarousel(node.media, bubbleElement)
            if (node.end_conversation) {
                disableInput()
                return
            }
            disableInput()
            await new Promise(r => setTimeout(r, 400))
            await autoAdvance()
            return
        }

        if (
            (nodeType === "options" && node.options?.length) ||
            (nodeType === "policy" && node.policy?.length)
        ) {
            renderInlineOptions(node, bubbleElement, sendFn)
            disableInput()
            return
        }

        if (TEXT_INPUT_TYPES.includes(nodeType || "")) {
            configureInput(nodeType || "question")
            enableInput()
            return
        }

        if (node.end_conversation) {
            disableInput()
            return
        }

        if (nodeType === "text" || nodeType === "html") {
            await autoAdvance()
            return
        }

    }, [
        config,
        appendMessage, configureInput, enableInput, disableInput,
        showTyping, hideTyping, scrollToBottom,
        renderBotMessage, renderLinkActions, renderMediaCarousel, renderInlineOptions,
    ])

    /* ── Send message ── */
    const send = useCallback(async (v?: string) => {
        if (!config) return

        const text = v ?? inputRef.current?.value?.trim()
        if (!text || !sessionIdRef.current) return

        if (sendingRef.current) return
        sendingRef.current = true

        if (v === undefined) {
            appendMessage("user", text)
            if (inputRef.current) inputRef.current.value = ""
        }

        disableInput()

        try {
            const r = await fetch(
                `${config.apiBase}/api/public-chatbot/chatbot-conversation/${sessionIdRef.current}/next`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ input: text })
                }
            )

            const nextNode: ChatNode = await r.json()

            if (nextNode?.validation_error) {
                appendMessage("bot", nextNode.message || "Error de validación", true)
                const inputType = nextNode.input_type || nextNode.type || "question"
                configureInput(inputType)
                enableInput()
                sendingRef.current = false
                return
            }

            if (nextNode?.completed) {
                disableInput()
                sendingRef.current = false
                return
            }

            process(nextNode, 0, send)

        } catch {
            hideTyping()
            appendMessage("bot", "Error al enviar el mensaje", true)
            enableInput()
            sendingRef.current = false
        }

        sendingRef.current = false

    }, [
        config,
        appendMessage,
        disableInput,
        enableInput,
        showTyping,
        hideTyping,
        process,
    ])

    /* ── Start conversation ── */
    const start = useCallback(async () => {
        if (!config) return

        try {
            showTyping()
            setStatusText("Conectando...")

            const visitorId = getVisitorId()

            const r = await fetch(
                `${config.apiBase}/api/public-chatbot/chatbot-conversation/${config.publicId}/start`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        origin_url: config.originDomain,
                        visitor_id: visitorId
                    })
                }
            )

            const d: ChatNode = await r.json()
            sessionIdRef.current = d.session_id!
            setSessionId(d.session_id!)
            localStorage.setItem(`chat_session_${config.publicId}`, d.session_id!)
            hideTyping()
            setStatusText("En línea")
            process(d, 0, send)
        } catch {
            hideTyping()
            setStatusText("Error")
            appendMessage("bot", "No pude conectarme al servidor", true)
        }
    }, [config, showTyping, hideTyping, appendMessage, process, send])

    /* ── Toggle open/close ── */
    const toggle = useCallback(() => {
        if (!config) return
        setIsOpen(prev => {
            const next = !prev
            isOpenRef.current = next
            if (next) {
                setWelcomeVisible(false)
                const welcomeKey = `chat_welcome_seen_${config.publicId}`
                localStorage.setItem(welcomeKey, "1")
                if (!startedRef.current) {
                    startedRef.current = true
                    setTimeout(() => start(), 0)
                }
            }
            return next
        })
    }, [config, start])

    const close = useCallback(() => {
        isOpenRef.current = false
        setIsOpen(false)
    }, [])

    /* ── Restart conversation ── */
    const restart = useCallback(async () => {
        sessionIdRef.current = null
        setSessionId(null)
        isOpenRef.current = true
        if (config) localStorage.removeItem(`chat_session_${config.publicId}`)

        if (messagesRef.current) messagesRef.current.innerHTML = ""
        if (inputRef.current) inputRef.current.value = ""
        disableInput()

        if (typingRef.current) {
            typingRef.current.remove()
            typingRef.current = null
        }

        setStatusText("Reiniciando…")
        startedRef.current = true
        await start()
    }, [disableInput, start])

    /* ── Return anticipado DESPUÉS de todos los hooks ── */
    if (!config) {
        return {
            messagesRef,
            inputRef,
            isOpen: false,
            statusText: "",
            inputDisabled: true,
            sendDisabled: true,
            welcomeVisible: false,
            viewerOpen: false,
            viewerUrl: "",
            viewerIsVideo: false,
            toggle: () => { },
            close: () => { },
            send: () => { },
            restart: () => { },
            closeViewer: () => { },
        }
    }

    return {
        messagesRef,
        inputRef,
        isOpen,
        statusText,
        inputDisabled,
        sendDisabled,
        welcomeVisible,
        viewerOpen,
        viewerUrl,
        viewerIsVideo,
        toggle,
        close,
        send,
        restart,
        closeViewer,
    }
}