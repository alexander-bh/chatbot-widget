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
  content?: string
  type?: string
  node_type?: string
  input_type?: string
  typing_time?: number
  end_conversation?: boolean
  completed?: boolean
  validation_error?: boolean
  message?: string
  options?: Option[]
  policy?: Option[]
  media?: MediaItem[]
  link_actions?: LinkAction[]
}

const TEXT_INPUT_TYPES = ["question", "email", "phone", "number"]

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */
const getTime = () =>
  new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })

const rgb = (hex: string) => {
  if (!/^#[\da-f]{6}$/i.test(hex)) return "37,99,235"
  return `${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5), 16)}`
}

/* ─────────────────────────────────────────
   HOOK
───────────────────────────────────────── */
export function useChatbot(config: ChatbotConfig) {
  const messagesRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [isOpen, setIsOpen] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [inputDisabled, setInputDisabled] = useState(true)
  const [sendDisabled, setSendDisabled] = useState(true)
  const [statusText, setStatusText] = useState("Conectando...")
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerUrl, setViewerUrl] = useState("")
  const [viewerIsVideo, setViewerIsVideo] = useState(false)
  const [welcomeVisible, setWelcomeVisible] = useState(false)

  const startedRef = useRef(false)
  const sessionIdRef = useRef<string | null>(null)
  const typingRef = useRef<HTMLDivElement | null>(null)

  // keep sessionIdRef in sync
  useEffect(() => { sessionIdRef.current = sessionId }, [sessionId])

  /* ── Apply theme CSS vars ── */
  useEffect(() => {
    document.documentElement.style.setProperty("--chat-primary", config.primaryColor)
    document.documentElement.style.setProperty("--chat-secondary", config.secondaryColor)
    document.documentElement.style.setProperty("--chat-primary-rgb", rgb(config.primaryColor))
    document.documentElement.style.setProperty("--chat-secondary-rgb", rgb(config.secondaryColor))
  }, [config.primaryColor, config.secondaryColor])

  /* ── Welcome message ── */
  useEffect(() => {
    const welcomeKey = `chat_welcome_seen_${config.publicId}`
    const isMobile = matchMedia("(max-width:480px)").matches

    if (!localStorage.getItem(welcomeKey) && config.welcomeMessage) {
      const delay = (config.welcomeDelay ?? 2) * 1000
      const timer = setTimeout(() => {
        if (!isOpen && (!isMobile || config.showWelcomeOnMobile)) {
          setWelcomeVisible(true)
          localStorage.setItem(welcomeKey, "1")
        }
      }, delay)
      return () => clearTimeout(timer)
    }
  }, [])

  /* ── Scroll to bottom ── */
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (messagesRef.current)
          messagesRef.current.scrollTop = messagesRef.current.scrollHeight
      }, 50)
    })
  }, [])

  /* ── Typing indicator ── */
  const showTyping = useCallback(() => {
    if (typingRef.current || !messagesRef.current) return
    const el = document.createElement("div")
    el.className = "msg bot typing"
    el.innerHTML = `
      <img src="${config.avatar}" class="msg-avatar" />
      <div class="msg-content">
        <div class="bubble">
          <span class="typing-dots"><span></span><span></span><span></span></span>
        </div>
      </div>`
    messagesRef.current.appendChild(el)
    typingRef.current = el
    scrollToBottom()
  }, [config.avatar, scrollToBottom])

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
    inputRef.current.placeholder = config.inputPlaceholder

    if (type === "email") {
      inputRef.current.type = "email"
      inputRef.current.placeholder = "correo@ejemplo.com"
    } else if (type === "phone") {
      inputRef.current.type = "tel"
      inputRef.current.placeholder = "Ej. +52 999 123 4567"
    } else if (type === "number") {
      inputRef.current.type = "text"
      inputRef.current.inputMode = "numeric"
    }
  }, [config.inputPlaceholder])

  /* ── Append plain message ── */
  const appendMessage = useCallback((from: "user" | "bot", text: string, error = false) => {
    if (!messagesRef.current) return
    const m = document.createElement("div")
    m.className = `msg ${from}${error ? " error" : ""}`

    if (from === "bot") {
      const a = document.createElement("img")
      a.src = config.avatar
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
  }, [config.avatar, scrollToBottom])

  /* ── Render bot bubble with HTML ── */
  const renderBotMessage = useCallback((html: string): HTMLDivElement => {
    const m = document.createElement("div")
    m.className = "msg bot"

    const avatarImg = document.createElement("img")
    avatarImg.src = config.avatar
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
  }, [config.avatar, scrollToBottom])

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

      switch (action.type) {
        case "link":
          a.href = action.value
          a.target = action.new_tab ? "_blank" : "_self"
          break
        case "email": {
          const subject = encodeURIComponent("Contacto desde el chatbot")
          const body = encodeURIComponent("Hola, quiero más información.")
          a.href = `mailto:${action.value.trim()}?subject=${subject}&body=${body}`
          a.target = "_self"
          break
        }
        case "phone":
          a.href = `tel:${action.value}`
          a.target = "_self"
          break
        case "whatsapp": {
          const phone = action.value.replace(/\D/g, "")
          const fullPhone = phone.startsWith("52") ? phone : `52${phone}`
          a.href = `https://wa.me/${fullPhone}`
          a.target = "_blank"
          a.rel = "noopener noreferrer"
          break
        }
        default:
          return
      }

      container.appendChild(a)
    })

    bubble.appendChild(container)
  }, [])

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
        item.dataset.more = `+${extra + 1}`
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
    const list = node.type === "policy" ? node.policy! : node.options!

    const optionsContainer = document.createElement("div")
    optionsContainer.className = "inline-options"

    list.forEach(o => {
      const btn = document.createElement("button")
      btn.textContent = o.label
      btn.onclick = () => {
        optionsContainer.querySelectorAll("button").forEach(b => {
          (b as HTMLButtonElement).disabled = true
          ;(b as HTMLButtonElement).style.opacity = "0.5"
          ;(b as HTMLButtonElement).style.cursor = "not-allowed"
          ;(b as HTMLButtonElement).style.pointerEvents = "none"
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
    if (!node || depth > 20) return

    const nodeType = node.input_type || node.type || node.node_type

    // Validation error: show error and re-enable input
    if (node.validation_error) {
      appendMessage("bot", node.message || "Error de validación", true)
      const inputType = node.input_type || node.type || "question"
      configureInput(inputType)
      enableInput()
      return
    }

    // Typing delay
    if (node.typing_time && node.typing_time > 0) {
      showTyping()
      scrollToBottom()
      await new Promise(r => setTimeout(r, node.typing_time! * 1000))
      hideTyping()
    }

    // Link node
    if (nodeType === "link") {
      let bubbleElement: HTMLDivElement | null = null
      if (node.content) {
        bubbleElement = renderBotMessage(node.content)
      }
      if (node.link_actions?.length && bubbleElement) {
        renderLinkActions(node.link_actions, bubbleElement)
      }
      disableInput()
      return
    }

    // Render bubble (or empty media-only bubble)
    let bubbleElement: HTMLDivElement
    if (node.content) {
      bubbleElement = renderBotMessage(node.content)
    } else {
      bubbleElement = renderBotMessage("")
      bubbleElement.classList.add("media-only")
    }

    // Media node
    if (nodeType === "media" && Array.isArray(node.media)) {
      renderMediaCarousel(node.media, bubbleElement)

      if (node.end_conversation) {
        disableInput()
        return
      }

      try {
        const sid = sessionIdRef.current
        const r = await fetch(
          `${config.apiBase}/api/public-chatbot/chatbot-conversation/${sid}/next`,
          { method: "POST" }
        )
        const nextNode: ChatNode = await r.json()
        if (!nextNode?.completed) return process(nextNode, depth + 1, sendFn)
      } catch {
        appendMessage("bot", "Ocurrió un error al continuar el flujo.", true)
      }
      return
    }

    // Options / Policy node
    if (
      (nodeType === "options" && node.options?.length) ||
      (nodeType === "policy" && node.policy?.length)
    ) {
      renderInlineOptions(node, bubbleElement, sendFn)
      disableInput()
      return
    }

    // Text input node
    if (TEXT_INPUT_TYPES.includes(nodeType || "")) {
      configureInput(nodeType || "question")
      enableInput()
      return
    }

    // End of conversation
    if (node.end_conversation) {
      disableInput()
      return
    }

    // Auto-advance to next node
    try {
      const sid = sessionIdRef.current
      const r = await fetch(
        `${config.apiBase}/api/public-chatbot/chatbot-conversation/${sid}/next`,
        { method: "POST" }
      )
      const nextNode: ChatNode = await r.json()
      if (!nextNode?.completed) return process(nextNode, depth + 1, sendFn)
    } catch {
      appendMessage("bot", "Ocurrió un error al continuar el flujo.", true)
    }
  }, [
    appendMessage, configureInput, enableInput, disableInput,
    showTyping, hideTyping, scrollToBottom,
    renderBotMessage, renderLinkActions, renderMediaCarousel, renderInlineOptions,
    config.apiBase
  ])

  /* ── Send message ── */
  const send = useCallback(async (v?: string) => {
    const text = v ?? inputRef.current?.value?.trim()
    if (!text || !sessionIdRef.current) return
    if (sendDisabled && v === undefined) return

    if (v === undefined) {
      appendMessage("user", text)
      if (inputRef.current) inputRef.current.value = ""
    }

    disableInput()
    showTyping()

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
      hideTyping()

      if (nextNode?.completed || nextNode?.end_conversation) {
        disableInput()
        return
      }

      process(nextNode, 0, send)
    } catch {
      hideTyping()
      appendMessage("bot", "Error al enviar el mensaje", true)
      enableInput()
    }
  }, [sendDisabled, appendMessage, disableInput, enableInput, showTyping, hideTyping, process, config.apiBase])

  /* ── Start conversation ── */
  const start = useCallback(async () => {
    try {
      showTyping()
      setStatusText("Conectando...")

      const r = await fetch(
        `${config.apiBase}/api/public-chatbot/chatbot-conversation/${config.publicId}/start`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ origin_url: config.originDomain })
        }
      )

      const d: ChatNode = await r.json()
      sessionIdRef.current = d.session_id!
      setSessionId(d.session_id!)
      hideTyping()
      setStatusText("En línea")
      process(d, 0, send)
    } catch {
      hideTyping()
      setStatusText("Error")
      appendMessage("bot", "No pude conectarme al servidor", true)
    }
  }, [config.apiBase, config.publicId, config.originDomain, showTyping, hideTyping, appendMessage, process, send])

  /* ── Toggle open/close ── */
  const toggle = useCallback(() => {
    setIsOpen(prev => {
      const next = !prev
      if (next) {
        setWelcomeVisible(false)
        const welcomeKey = `chat_welcome_seen_${config.publicId}`
        localStorage.setItem(welcomeKey, "1")
        if (!startedRef.current) {
          startedRef.current = true
          // defer to after state update
          setTimeout(() => start(), 0)
        }
      }
      return next
    })
  }, [config.publicId, start])

  const close = useCallback(() => {
    setIsOpen(false)
  }, [])

  /* ── Restart conversation ── */
  const restart = useCallback(async () => {
    sessionIdRef.current = null
    setSessionId(null)
    startedRef.current = false

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

  return {
    // refs
    messagesRef,
    inputRef,
    // state
    isOpen,
    statusText,
    inputDisabled,
    sendDisabled,
    welcomeVisible,
    viewerOpen,
    viewerUrl,
    viewerIsVideo,
    // actions
    toggle,
    close,
    send,
    restart,
    closeViewer,
  }
}