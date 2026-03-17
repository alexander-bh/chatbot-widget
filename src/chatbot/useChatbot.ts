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

const LINK_ICONS: Record<string, string> = {
    email: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`,
    whatsapp: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>`,
    phone: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.68h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 10.3a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 17.92z"/></svg>`,
    link: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
}

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

const lighten = (hex: string, amount: number): string => {
    if (!/^#[\da-f]{6}$/i.test(hex)) return hex
    const clamp = (n: number) => Math.min(255, Math.max(0, n))
    const r = clamp(parseInt(hex.slice(1, 3), 16) + amount)
    const g = clamp(parseInt(hex.slice(3, 5), 16) + amount)
    const b = clamp(parseInt(hex.slice(5), 16) + amount)
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`
}

const darken = (hex: string, amount: number): string => lighten(hex, -amount)

export function useChatbot(config: ChatbotConfig | null) {

    /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       1. REFS
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
    const messagesRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const startedRef = useRef(false)
    const sessionIdRef = useRef<string | null>(null)
    const typingRef = useRef<HTMLDivElement | null>(null)
    const sendingRef = useRef(false)
    const isOpenRef = useRef(false)

    const MESSAGES_KEY = config ? `chatbot_dom_${config.publicId}` : null

    /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       2. STATE
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
    const [isOpen, setIsOpen] = useState(false)
    const [sessionId, setSessionId] = useState<string | null>(() => {
        if (!config) return null
        return localStorage.getItem(`chat_session_${config.publicId}`) ?? null
    })
    const [connectionStatus, setConnectionStatus] = useState<"connected" | "error" | "connecting">("connecting")
    const [unreadCount, setUnreadCount] = useState(0)
    const [inputDisabled, setInputDisabled] = useState(true)
    const [sendDisabled, setSendDisabled] = useState(true)
    const [statusText, setStatusText] = useState("Conectando...")
    const [viewerOpen, setViewerOpen] = useState(false)
    const [viewerUrl, setViewerUrl] = useState("")
    const [viewerIsVideo, setViewerIsVideo] = useState(false)
    const [welcomeVisible, setWelcomeVisible] = useState(false)
    const appendServerErrorRef = useRef<() => void>(() => { })
    const errorMsgRef = useRef<HTMLDivElement | null>(null)
    const retryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const processRef = useRef<((node: ChatNode, depth: number, sendFn: (v: string) => Promise<void>) => Promise<void>) | null>(null)
    const sendRef = useRef<((v?: string) => Promise<void>) | null>(null)



    /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       3. CALLBACKS BÁSICOS (sin dependencias de otros callbacks)
       Deben ir ANTES de los useEffect que los usan
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

    const clearRetryInterval = useCallback(() => {
        if (retryIntervalRef.current) {
            clearInterval(retryIntervalRef.current)
            retryIntervalRef.current = null
        }
    }, [])

    const scrollToBottom = useCallback(() => {
        requestAnimationFrame(() => {
            if (messagesRef.current) {
                messagesRef.current.scrollTop = messagesRef.current.scrollHeight
            }
        })
    }, [])

    const disableInput = useCallback(() => {
        setInputDisabled(true)
        setSendDisabled(true)
    }, [])

    const enableInput = useCallback(() => {
        setInputDisabled(false)
        setSendDisabled(false)
        setTimeout(() => inputRef.current?.focus(), 50)
    }, [])


    /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       4. EFFECTS
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

    // 4a. Sync sessionId ref
    useEffect(() => {
        sessionIdRef.current = sessionId
    }, [sessionId])

    // 4b. Restaurar sesión activa si existe (sin tocar el DOM todavía)
    useEffect(() => {
        if (!config) return
        const savedSession = localStorage.getItem(`chat_session_${config.publicId}`)
        const savedMessages = sessionStorage.getItem(`chatbot_dom_${config.publicId}`)

        if (savedSession && savedMessages) {
            sessionIdRef.current = savedSession
            setSessionId(savedSession)
            startedRef.current = true
            setStatusText("En línea")
            setConnectionStatus("connected")
            setInputDisabled(false)
            setSendDisabled(false)
        }
    }, [config?.publicId])

    // 4c. Aplicar theme CSS vars
    useEffect(() => {
        if (!config) return
        const p = config.primaryColor
        const s = config.secondaryColor
        document.documentElement.style.setProperty("--chat-primary", p)
        document.documentElement.style.setProperty("--chat-primary-light", lighten(p, 28))
        document.documentElement.style.setProperty("--chat-primary-dark", darken(p, 22))
        document.documentElement.style.setProperty("--chat-primary-rgb", rgb(p))
        document.documentElement.style.setProperty("--chat-secondary", s)
    }, [config?.primaryColor, config?.secondaryColor])

    // 4d. Restaurar HTML del DOM — ÚNICO efecto de restauración
    useEffect(() => {
        if (!MESSAGES_KEY || !messagesRef.current) return
        try {
            const saved = sessionStorage.getItem(MESSAGES_KEY)
            if (saved) {
                messagesRef.current.innerHTML = saved
                // Botones de opciones anteriores ya no son funcionales
                messagesRef.current
                    .querySelectorAll<HTMLButtonElement>(".inline-options button")
                    .forEach(btn => {
                        btn.disabled = true
                        btn.style.opacity = "0.5"
                        btn.style.cursor = "not-allowed"
                        btn.style.pointerEvents = "none"
                    })
                scrollToBottom()
            }
        } catch { }
    }, [MESSAGES_KEY, scrollToBottom])

    // 4e. MutationObserver — persistir cambios del DOM en sessionStorage
    useEffect(() => {
        if (!MESSAGES_KEY || !messagesRef.current) return

        const observer = new MutationObserver(() => {
            if (!messagesRef.current || !MESSAGES_KEY) return
            try {
                sessionStorage.setItem(MESSAGES_KEY, messagesRef.current.innerHTML)
            } catch { }
        })

        observer.observe(messagesRef.current, {
            childList: true,
            subtree: true,
            characterData: true
        })

        return () => observer.disconnect()
    }, [MESSAGES_KEY])

    // 4f. Welcome message
    useEffect(() => {
        if (!config?.welcomeMessage) return
        const isMobile = matchMedia("(max-width:480px)").matches
        if (isMobile && config.showWelcomeOnMobile === false) return

        const delay = (config.welcomeDelay ?? 2) * 1000

        // ✅ Registrar el listener ANTES del setTimeout
        const handlePermission = (e: MessageEvent) => {
            if (!e.data || e.data.type !== "CHATBOT_WELCOME_PERMISSION") return
            if (e.data.allowed && !isOpenRef.current) {
                setWelcomeVisible(true)
            }
        }
        window.addEventListener("message", handlePermission)

        // ✅ Enviar el request DESPUÉS de registrar el listener
        const timer = setTimeout(() => {
            if (isOpenRef.current) return
            window.parent.postMessage({ type: "CHATBOT_WELCOME_REQUEST" }, "*")
        }, delay)

        return () => {
            clearTimeout(timer)
            window.removeEventListener("message", handlePermission)
        }
    }, [
        config?.publicId,
        config?.welcomeMessage,
        config?.welcomeDelay,
        config?.showWelcomeOnMobile
    ])

    /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       5. CALLBACKS COMPUESTOS
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

    const configureInput = useCallback((type: string) => {
        if (!inputRef.current) return
        inputRef.current.type = "text"
        inputRef.current.placeholder = config?.inputPlaceholder ?? "Escribe tu mensaje..."
        if (type === "email") { inputRef.current.type = "email"; inputRef.current.placeholder = "correo@ejemplo.com" }
        if (type === "phone") { inputRef.current.type = "tel"; inputRef.current.placeholder = "Ej. +52 999 123 4567" }
        if (type === "number") { inputRef.current.type = "number" }
    }, [config?.inputPlaceholder])

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
        if (from === "bot" && !isOpenRef.current) setUnreadCount(prev => prev + 1)
        scrollToBottom()
    }, [config?.avatar, scrollToBottom])

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
        if (!isOpenRef.current) setUnreadCount(prev => prev + 1)
        scrollToBottom()

        return bubble
    }, [config?.avatar, scrollToBottom])

    const openImageViewer = useCallback((url: string) => {
        setViewerIsVideo(false); setViewerUrl(url); setViewerOpen(true)
    }, [])

    const openVideoViewer = useCallback((url: string) => {
        setViewerIsVideo(true); setViewerUrl(url); setViewerOpen(true)
    }, [])

    const closeViewer = useCallback(() => {
        setViewerOpen(false); setViewerUrl("")
    }, [])

    const renderLinkActions = useCallback((actions: LinkAction[], bubble: HTMLDivElement) => {
        const container = document.createElement("div")
        container.className = "link-actions"

        actions.forEach(action => {
            const a = document.createElement("a")
            a.className = `link-action link-${action.type}`
            const icon = LINK_ICONS[action.type] ?? ""
            a.innerHTML = `
                <span class="link-action-icon">${icon}</span>
                <span class="link-action-label">${action.title || action.value}</span>
            `
            a.target = "_blank"
            a.rel = "noopener noreferrer"

            switch (action.type) {
                case "link":
                    a.href = action.value
                    break
                case "email": {
                    const email = action.value.trim()
                    const chatbotName = config?.name || "Chatbot"
                    const subject = encodeURIComponent(`Contacto desde chatbot: ${chatbotName}`)
                    const body = encodeURIComponent(`Hola,\n\nEstoy contactando desde el chatbot "${chatbotName}".\n\nQuiero más información.\n\nGracias.`)
                    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
                    a.href = isMobile
                        ? `mailto:${email}?subject=${subject}&body=${body}`
                        : `https://mail.google.com/mail/?view=cm&fs=1&to=${email}&su=${subject}&body=${body}`
                    break
                }
                case "phone":
                    a.href = `tel:${action.value}`
                    break
                case "whatsapp": {
                    const phone = action.value.replace(/\D/g, "")
                    const fullPhone = phone.startsWith("52") ? phone : `52${phone}`
                    a.href = `https://api.whatsapp.com/send?phone=${fullPhone}`
                    break
                }
                default: return
            }
            container.appendChild(a)
        })
        bubble.appendChild(container)
    }, [config])

    const renderMediaCarousel = useCallback((mediaList: MediaItem[], bubbleElement: HTMLDivElement) => {
        const msgEl = bubbleElement.closest(".msg.bot")
        if (msgEl) msgEl.classList.add("media-msg")

        const wrapper = document.createElement("div")
        wrapper.className = "media-carousel-wrapper"

        const MAX_VISIBLE = 4
        const total = mediaList.length
        const extra = total - MAX_VISIBLE

        const countMap: Record<number, string> = { 1: "count-1", 2: "count-2", 3: "count-3", 4: "count-4" }
        const grid = document.createElement("div")
        grid.className = `media-grid ${countMap[Math.min(total, 4)] ?? "count-more"}`

        mediaList.slice(0, MAX_VISIBLE).forEach((media, index) => {
            const item = document.createElement("div")
            item.className = "media-item"

            if (index === MAX_VISIBLE - 1 && extra > 0) {
                item.classList.add("has-more-overlay")
                const moreEl = document.createElement("span")
                moreEl.className = "more-overlay"
                moreEl.textContent = `+${extra}`
                item.appendChild(moreEl)
            }
            if (media.type === "image") {
                const img = document.createElement("img")
                img.src = media.url
                img.loading = "lazy"
                img.onload = () => img.classList.add("loaded")
                img.onerror = () => img.classList.add("loaded")
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
                    const overlay = document.createElement("div")
                    overlay.className = "video-play-overlay"
                    overlay.innerHTML = `<svg viewBox="0 0 48 48" width="44" height="44"><circle cx="24" cy="24" r="24" fill="rgba(0,0,0,0.5)"/><polygon points="19,14 38,24 19,34" fill="white"/></svg>`
                    item.style.cursor = "pointer"
                    item.onclick = () => openVideoViewer(media.url)
                    item.appendChild(overlay)
                }
                video.onloadeddata = () => video.classList.add("loaded")
                video.onerror = () => video.classList.add("loaded")
            }
            grid.appendChild(item)
        })

        wrapper.appendChild(grid)
        bubbleElement.appendChild(wrapper)
        scrollToBottom()
    }, [openImageViewer, openVideoViewer, scrollToBottom])

    const renderInlineOptions = useCallback(
        (node: ChatNode, bubbleElement: HTMLDivElement, sendFn: (v: string) => Promise<void>) => {
            const list = (node.node_type === "policy" || node.type === "policy")
                ? node.policy!
                : node.options!

            const container = document.createElement("div")
            container.className = "inline-options"

            list.forEach(o => {
                const btn = document.createElement("button")
                btn.textContent = o.label
                btn.onclick = async () => {
                    container.querySelectorAll<HTMLButtonElement>("button").forEach(b => {
                        b.disabled = true
                        b.style.opacity = "0.5"
                        b.style.cursor = "not-allowed"
                        b.style.pointerEvents = "none"
                    })
                    disableInput()
                    appendMessage("user", o.label)
                    await sendFn(o.value || o.label)
                }
                container.appendChild(btn)
            })
            bubbleElement.appendChild(container)
        },
        [disableInput, appendMessage]
    )

    const appendServerError = useCallback(() => {
        if (!messagesRef.current) return
        if (errorMsgRef.current) return  // ya hay uno visible, no duplicar

        const m = document.createElement("div")
        m.className = "msg bot error-server"

        const avatarImg = document.createElement("img")
        avatarImg.src = config?.avatar ?? ""
        avatarImg.className = "msg-avatar"

        const contentWrapper = document.createElement("div")
        contentWrapper.className = "msg-content"

        const bubble = document.createElement("div")
        bubble.className = "bubble bubble-server-error"
        bubble.innerHTML = `
        <div class="server-error-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                 stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12H3a9 9 0 1 0 3-6.7"/>
                <polyline points="3 3 3 9 9 9"/>
            </svg>
        </div>
        <p class="server-error-title">Sin conexión al servidor</p>
        <p class="server-error-sub">Intentando reconectar<span class="retry-dots"></span></p>
    `

        const timeEl = document.createElement("div")
        timeEl.className = "message-time"
        timeEl.textContent = getTime()

        contentWrapper.append(bubble, timeEl)
        m.append(avatarImg, contentWrapper)
        messagesRef.current.appendChild(m)
        errorMsgRef.current = m
        scrollToBottom()

        // Animación de puntos
        const dotsEl = bubble.querySelector(".retry-dots") as HTMLElement
        let dotCount = 0
        const dotsInterval = setInterval(() => {
            dotCount = (dotCount + 1) % 4
            if (dotsEl) dotsEl.textContent = ".".repeat(dotCount)
        }, 500)

        // Reintentar cada 5s
        retryIntervalRef.current = setInterval(async () => {
            try {
                const r = await fetch(
                    `${config!.apiBase}/api/public-chatbot/chatbot-conversation/${config!.publicId}/start`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ origin_url: config!.originDomain, visitor_id: getVisitorId() })
                    }
                )
                if (!r.ok) return  // sigue esperando

                const d: ChatNode = await r.json()

                // ✅ Servidor restaurado — limpiar error y reiniciar
                clearInterval(dotsInterval)
                clearRetryInterval()
                errorMsgRef.current?.remove()
                errorMsgRef.current = null
                if (messagesRef.current) messagesRef.current.innerHTML = ""

                sessionIdRef.current = d.session_id!
                setSessionId(d.session_id!)
                localStorage.setItem(`chat_session_${config!.publicId}`, d.session_id!)
                setStatusText("En línea")
                setConnectionStatus("connected")
                processRef.current?.(d, 0, sendRef.current!)

            } catch {
                // sigue esperando, no hacer nada
            }
        }, 5000)

        // Limpiar dotsInterval si el componente se desmonta
        return () => {
            clearInterval(dotsInterval)
        }
    }, [config, scrollToBottom, clearRetryInterval])

    const process = useCallback(async (
        node: ChatNode,
        depth = 0,
        sendFn: (v: string) => Promise<void>
    ): Promise<void> => {
        if (!node || depth > 50 || !config) return

        const nodeType = node.node_type || node.type

        if (node.validation_error) {
            hideTyping()
            appendMessage("bot", node.message || "Error de validación", true)
            configureInput(node.input_type || node.type || "question")
            enableInput()
            return
        }

        if (node.typing_time && node.typing_time > 0) {
            showTyping()
            scrollToBottom()
            await new Promise(r => setTimeout(r, node.typing_time! * 1000))
            hideTyping()
        }

        const autoAdvance = async () => {
            try {
                const sid = sessionIdRef.current
                if (!sid) return
                const r = await fetch(
                    `${config.apiBase}/api/public-chatbot/chatbot-conversation/${sid}/next`,
                    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }
                )
                const nextNode: ChatNode = await r.json()
                if (!nextNode || nextNode.completed) { disableInput(); return }
                return process(nextNode, depth + 1, sendFn)
            } catch {
                appendServerErrorRef.current()
            }
        }

        if (nodeType === "link") {
            const bubble = renderBotMessage(node.content || "")
            if (node.link_actions?.length) renderLinkActions(node.link_actions, bubble)
            if (node.end_conversation) { disableInput(); return }
            await autoAdvance()
            return
        }

        if (nodeType === "media" && Array.isArray(node.media)) {

            const bubbleElement = (() => {
                const b = renderBotMessage("")
                b.classList.add("media-only")
                b.style.minHeight = "0"
                return b
            })()

            if (node.content) {
                const caption = document.createElement("div")
                caption.className = "media-caption"
                caption.textContent = node.content
                bubbleElement.prepend(caption)
                bubbleElement.classList.remove("media-only")
            }

            renderMediaCarousel(node.media, bubbleElement)

            if (node.end_conversation) { disableInput(); return }
            disableInput()
            await new Promise(r => setTimeout(r, 400))
            await autoAdvance()
            return
        }

        const bubbleElement = node.content
            ? renderBotMessage(node.content)
            : (() => { const b = renderBotMessage(""); b.classList.add("media-only"); return b })()

        if ((nodeType === "options" && node.options?.length) ||
            (nodeType === "policy" && node.policy?.length)) {
            renderInlineOptions(node, bubbleElement, sendFn)
            disableInput()
            return
        }

        if (TEXT_INPUT_TYPES.includes(nodeType || "")) {
            configureInput(nodeType || "question")
            enableInput()
            return
        }

        if (nodeType === "text" || nodeType === "html") {
            if (node.end_conversation) { disableInput(); return }
            await autoAdvance()
            return
        }

        if (node.end_conversation) { disableInput(); return }

    }, [
        config,
        appendMessage, configureInput, enableInput, disableInput,
        showTyping, hideTyping, scrollToBottom,
        renderBotMessage, renderLinkActions, renderMediaCarousel, renderInlineOptions,
    ])

    const send = useCallback(async (v?: string): Promise<void> => {
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
                { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: text }) }
            )
            const nextNode: ChatNode = await r.json()

            if (nextNode?.validation_error) {
                appendMessage("bot", nextNode.message || "Error de validación", true)
                configureInput(nextNode.input_type || nextNode.type || "question")
                enableInput()
                sendingRef.current = false
                return
            }
            if (nextNode?.completed) { disableInput(); sendingRef.current = false; return }
            await process(nextNode, 0, send)
        } catch {
            hideTyping()
            appendServerErrorRef.current()
            enableInput()
        }
        sendingRef.current = false
    }, [config, appendMessage, disableInput, enableInput, hideTyping, process])

    useEffect(() => { appendServerErrorRef.current = appendServerError }, [appendServerError])
    useEffect(() => { processRef.current = process }, [process])
    useEffect(() => { sendRef.current = send }, [send])

    const start = useCallback(async () => {
        if (!config) return
        try {
            showTyping()
            setStatusText("Conectando...")
            const r = await fetch(
                `${config.apiBase}/api/public-chatbot/chatbot-conversation/${config.publicId}/start`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ origin_url: config.originDomain, visitor_id: getVisitorId() })
                }
            )
            const d: ChatNode = await r.json()
            sessionIdRef.current = d.session_id!
            setSessionId(d.session_id!)
            localStorage.setItem(`chat_session_${config.publicId}`, d.session_id!)
            hideTyping()
            setStatusText("En línea")
            setConnectionStatus("connected")
            process(d, 0, send)
        } catch {
            hideTyping()
            setStatusText("Error")
            setConnectionStatus("error")
            appendServerErrorRef.current()
        }
    }, [config, showTyping, hideTyping, process, send])

    const toggle = useCallback(() => {
        if (!config) return
        setIsOpen(prev => {
            const next = !prev
            isOpenRef.current = next
            if (next) {
                setWelcomeVisible(false)
                setUnreadCount(0)
                // Notificar al padre que el welcome fue cerrado/visto
                window.parent.postMessage({ type: "CHATBOT_WELCOME_SEEN" }, "*")
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

    const restart = useCallback(async () => {
        clearRetryInterval()           
        errorMsgRef.current?.remove()
        errorMsgRef.current = null    
        sessionIdRef.current = null
        setSessionId(null)
        if (config) {
            localStorage.removeItem(`chat_session_${config.publicId}`)
            sessionStorage.removeItem(`chatbot_dom_${config.publicId}`)
        }
        if (messagesRef.current) messagesRef.current.innerHTML = ""
        if (inputRef.current) inputRef.current.value = ""
        if (typingRef.current) { typingRef.current.remove(); typingRef.current = null }
        disableInput()
        setStatusText("Reiniciando…")
        startedRef.current = true
        await start()
    }, [config, disableInput, start,clearRetryInterval])

    /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       6. RETURN ANTICIPADO (después de todos los hooks)
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
    if (!config) {
        return {
            messagesRef, inputRef,
            isOpen: false, statusText: "", inputDisabled: true, sendDisabled: true,
            welcomeVisible: false, viewerOpen: false, viewerUrl: "", viewerIsVideo: false,
            toggle: () => { }, close: () => { }, send: async () => { }, restart: async () => { }, closeViewer: () => { },
            connectionStatus: "connecting" as const, unreadCount: 0,
        }
    }

    return {
        messagesRef, inputRef,
        isOpen, statusText, inputDisabled, sendDisabled,
        welcomeVisible, viewerOpen, viewerUrl, viewerIsVideo,
        toggle, close, send, restart, closeViewer,
        connectionStatus, unreadCount,
    }
}