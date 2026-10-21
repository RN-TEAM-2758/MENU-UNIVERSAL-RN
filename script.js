--[[
    NovaUI  -  Interface (UI) para Roblox em Luau
    ---------------------------------------------------------------
    Como usar:
      * LocalScript (StarterPlayerScripts) ou executor, sem alterações.
      * Reexecutar o script destrói a interface anterior (sem duplicar).

    API resumida (veja o painel de demonstração no final do arquivo):
      local Win = Nova.CreateWindow({Title, SubTitle, ConfigName, ToggleKey, Accent})
      local Tab = Win:AddTab("Nome")
      local Sec = Tab:AddSection("Nome")
      Sec:AddToggle  {Name, Flag, Default, Callback, CallOnInit}
      Sec:AddSlider  {Name, Flag, Min, Max, Default, Step, Suffix, Callback}
      Sec:AddButton  {Name, Callback}
      Sec:AddInput   {Name, Flag, Default, Placeholder, Numeric, Min, Max, Validate, Callback}
      Sec:AddDropdown{Name, Flag, Options, Default, Multi, Placeholder, Callback}
      Sec:AddKeybind {Name, Flag, Default, Callback (ao pressionar), Changed (ao trocar)}
      Sec:AddLabel("texto")
      Win:Notify{Title, Content, Duration, Type = info/success/warning/error}

    Observações:
      * Elementos com "Flag" são salvos/restaurados automaticamente
        (precisa de writefile/readfile; sem eles a UI funciona normalmente,
        apenas sem persistência).
      * O Callback é chamado quando o usuário altera o valor ou quando um
        valor salvo é restaurado. Para também chamar com o valor Default
        na criação, use CallOnInit = true.
]]

local Players = game:GetService("Players")
local UserInputService = game:GetService("UserInputService")
local TweenService = game:GetService("TweenService")
local RunService = game:GetService("RunService")
local HttpService = game:GetService("HttpService")
local Lighting = game:GetService("Lighting")
local TeleportService = game:GetService("TeleportService")
local Workspace = game:GetService("Workspace")

local LocalPlayer = Players.LocalPlayer
if not LocalPlayer then
    warn("[NovaUI] Execute este script no cliente (LocalScript ou executor).")
    return
end

--// ============================================================
--//  Constantes e utilidades
--// ============================================================

local ROOT_NAME = "NovaUI_Root"
local INSTANCE_KEY = "__NOVAUI_INSTANCE"
local CONFIG_FOLDER = "NovaUI"
local ENV = (type(getgenv) == "function" and getgenv()) or _G

local DEFAULT_ACCENT = Color3.fromRGB(99, 102, 241)
local FONT = Enum.Font.GothamMedium
local FONT_BOLD = Enum.Font.GothamBold
local ROW_H = 38

local Theme = {
    Background = Color3.fromRGB(16, 16, 22),
    Surface = Color3.fromRGB(24, 24, 32),
    Element = Color3.fromRGB(33, 33, 44),
    ElementHover = Color3.fromRGB(43, 43, 58),
    Stroke = Color3.fromRGB(54, 54, 72),
    Off = Color3.fromRGB(64, 64, 84),
    Text = Color3.fromRGB(236, 236, 246),
    SubText = Color3.fromRGB(150, 150, 172),
    Accent = DEFAULT_ACCENT,
}

local HAS_FS = type(writefile) == "function" and type(readfile) == "function" and type(isfile) == "function"
local HAS_FOLDER = false
if HAS_FS and type(isfolder) == "function" and type(makefolder) == "function" then
    HAS_FOLDER = pcall(function()
        if not isfolder(CONFIG_FOLDER) then
            makefolder(CONFIG_FOLDER)
        end
    end)
end

local function fire(callback, ...)
    if type(callback) ~= "function" then
        return
    end
    local ok, err = pcall(callback, ...)
    if not ok then
        warn("[NovaUI] Erro em callback: " .. tostring(err))
    end
end

local function roundTo(value, step)
    if not step or step <= 0 then
        return value
    end
    local rounded = math.floor(value / step + 0.5) * step
    return tonumber(string.format("%.4f", rounded))
end

local function parseHex(text)
    local hex = (tostring(text):gsub("[#%s]", ""))
    if #hex ~= 6 or not hex:match("^%x+$") then
        return nil
    end
    local r = tonumber(hex:sub(1, 2), 16)
    local g = tonumber(hex:sub(3, 4), 16)
    local b = tonumber(hex:sub(5, 6), 16)
    return Color3.fromRGB(r, g, b), "#" .. hex:upper()
end

local function toKeyCode(v)
    if typeof(v) == "EnumItem" and v.EnumType == Enum.KeyCode then
        return v
    end
    if type(v) == "string" then
        local ok, kc = pcall(function()
            return Enum.KeyCode[v]
        end)
        if ok and kc then
            return kc
        end
    end
    return Enum.KeyCode.Unknown
end

local function new(class, props, parent)
    local inst = Instance.new(class)
    if props then
        for k, v in pairs(props) do
            inst[k] = v
        end
    end
    if parent then
        inst.Parent = parent
    end
    return inst
end

local function corner(parent, radius)
    return new("UICorner", {CornerRadius = UDim.new(0, radius or 8)}, parent)
end

local function stroke(parent, color, thickness, transparency)
    return new("UIStroke", {
        Color = color or Theme.Stroke,
        Thickness = thickness or 1,
        Transparency = transparency or 0,
        ApplyStrokeMode = Enum.ApplyStrokeMode.Border,
    }, parent)
end

local function padding(parent, l, t, r, b)
    return new("UIPadding", {
        PaddingLeft = UDim.new(0, l or 0),
        PaddingTop = UDim.new(0, t or 0),
        PaddingRight = UDim.new(0, r or 0),
        PaddingBottom = UDim.new(0, b or 0),
    }, parent)
end

local function tween(inst, duration, props)
    local tw = TweenService:Create(
        inst,
        TweenInfo.new(duration or 0.15, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
        props
    )
    tw:Play()
    return tw
end

local function makeLabel(parent, text, props)
    local p = {
        BackgroundTransparency = 1,
        BorderSizePixel = 0,
        Text = text,
        Font = FONT,
        TextSize = 13,
        TextColor3 = Theme.Text,
        TextXAlignment = Enum.TextXAlignment.Left,
    }
    if props then
        for k, v in pairs(props) do
            p[k] = v
        end
    end
    return new("TextLabel", p, parent)
end

local function hoverEffect(row, target)
    local state = {over = false}
    target.MouseEnter:Connect(function()
        state.over = true
        tween(row, 0.1, {BackgroundColor3 = Theme.ElementHover})
    end)
    target.MouseLeave:Connect(function()
        state.over = false
        tween(row, 0.1, {BackgroundColor3 = Theme.Element})
    end)
    return state
end

--// ============================================================
--//  Montagem do ScreenGui / limpeza de instâncias anteriores
--// ============================================================

local function candidateParents()
    local list = {}
    if type(gethui) == "function" then
        local ok, r = pcall(gethui)
        if ok and typeof(r) == "Instance" then
            table.insert(list, r)
        end
    end
    local okCore, core = pcall(function()
        return game:GetService("CoreGui")
    end)
    if okCore and core then
        table.insert(list, core)
    end
    local pg = LocalPlayer:FindFirstChildOfClass("PlayerGui")
    if pg then
        table.insert(list, pg)
    end
    return list
end

local function destroyPrevious()
    local old = ENV[INSTANCE_KEY]
    if type(old) == "table" and type(old.Destroy) == "function" then
        pcall(old.Destroy, old)
    end
    ENV[INSTANCE_KEY] = nil
    for _, parent in ipairs(candidateParents()) do
        pcall(function()
            local g = parent:FindFirstChild(ROOT_NAME)
            while g do
                g:Destroy()
                g = parent:FindFirstChild(ROOT_NAME)
            end
        end)
    end
end

local function mountGui(gui)
    for _, parent in ipairs(candidateParents()) do
        local ok = pcall(function()
            gui.Parent = parent
        end)
        if ok and gui.Parent == parent then
            return true
        end
    end
    local pg = LocalPlayer:WaitForChild("PlayerGui", 10)
    if pg then
        gui.Parent = pg
        return true
    end
    return false
end

local function loadConfig(path)
    if not HAS_FS then
        return {}
    end
    local ok, data = pcall(function()
        if isfile(path) then
            return HttpService:JSONDecode(readfile(path))
        end
        return nil
    end)
    if ok and type(data) == "table" then
        return data
    end
    if not ok then
        return {}, tostring(data) -- arquivo existe mas está inválido
    end
    return {}
end

--// ============================================================
--//  Biblioteca
--// ============================================================

local Nova = {}

function Nova.CreateWindow(opts)
    opts = opts or {}
    destroyPrevious()

    local Window = {
        Flags = {},
        Elements = {},
        Tabs = {},
        CanSave = HAS_FS,
        ToggleKey = toKeyCode(opts.ToggleKey or Enum.KeyCode.RightShift),
    }

    local alive = true
    local visible = true
    local connections = {}
    local cleanups = {}
    local accentUpdaters = {}
    local keybinds = {}
    local listeningKeybind = nil
    local userScale = 1
    local mainSize = Vector2.new(520, 340)
    local mainPos = {x = 0, y = 0}
    local launcherPos = {x = 12, y = 120}
    local notifyCount = 0
    local activeDrag = nil

    Theme.Accent = opts.Accent or DEFAULT_ACCENT

    local function track(conn)
        table.insert(connections, conn)
        return conn
    end

    local function bindAccent(fn)
        fn()
        table.insert(accentUpdaters, fn)
    end

    --// ---------- Central de Eventos (histórico interno) ----------
    local EVENT_MAX = 300
    local LEVELS = {INFO = true, SUCCESS = true, WARNING = true, ERROR = true}
    local SENSITIVE = {"password", "senha", "token", "secret", "apikey", "api_key", "cookie", "roblosecurity", "authorization"}
    local loadErr = nil -- preenchido ao carregar o arquivo de configuração
    local booting = true -- durante a montagem da interface não gera eventos de configuração
    Window.Events = {}
    local eventListeners = {}
    local eventSeq = 0
    local rate = {sec = 0, n = 0, dropped = 0}

    local function stamp()
        local ok, s = pcall(os.date, "%H:%M:%S")
        if ok and type(s) == "string" then
            return s
        end
        return string.format("+%ds", math.floor(os.clock()))
    end

    -- nunca guarda senhas/chaves; limita o tamanho dos textos
    local function sanitize(text, limit)
        text = tostring(text == nil and "" or text)
        local low = text:lower()
        for _, w in ipairs(SENSITIVE) do
            if low:find(w, 1, true) then
                return "[conteúdo sensível omitido]"
            end
        end
        limit = limit or 300
        if #text > limit then
            text = text:sub(1, limit) .. "..."
        end
        return text
    end

    local function pushEvent(level, message, detail)
        local events = Window.Events
        local now = os.clock()
        for i = #events, math.max(1, #events - 7), -1 do -- duplicados recentes viram contador
            local e = events[i]
            if e.level == level and e.msg == message and e.detail == detail and now - e.clk < 5 then
                e.count = e.count + 1
                e.clk = now
                e.time = stamp()
                for _, fn in ipairs(eventListeners) do
                    pcall(fn, e, true)
                end
                return e
            end
        end
        eventSeq = eventSeq + 1
        local e = {id = eventSeq, level = level, msg = message, detail = detail, count = 1, time = stamp(), clk = now}
        table.insert(events, e)
        if #events > EVENT_MAX then
            table.remove(events, 1)
        end
        for _, fn in ipairs(eventListeners) do
            pcall(fn, e, false)
        end
        return e
    end

    function Window:Log(level, message, detail)
        if not alive then
            return nil
        end
        level = tostring(level or "INFO"):upper()
        if not LEVELS[level] then
            level = "INFO"
        end
        local sec = math.floor(os.clock())
        if rate.sec ~= sec then
            local dropped = rate.dropped
            rate.sec, rate.n, rate.dropped = sec, 0, 0
            if dropped > 0 then
                pushEvent("WARNING", dropped .. " evento(s) descartado(s) por excesso de registros", nil)
            end
        end
        rate.n = rate.n + 1
        if rate.n > 25 then -- proteção contra loops de eventos
            rate.dropped = rate.dropped + 1
            return nil
        end
        message = sanitize(message, 200)
        if detail ~= nil and detail ~= "" then
            detail = sanitize(detail, 400)
        else
            detail = nil
        end
        return pushEvent(level, message, detail)
    end

    function Window:OnEvent(fn)
        table.insert(eventListeners, fn)
        return function()
            for i, f in ipairs(eventListeners) do
                if f == fn then
                    table.remove(eventListeners, i)
                    break
                end
            end
        end
    end

    function Window:ClearEvents()
        Window.Events = {}
        for _, fn in ipairs(eventListeners) do
            pcall(fn, nil, false)
        end
    end

    function Window:EventCounts()
        local c = {INFO = 0, SUCCESS = 0, WARNING = 0, ERROR = 0}
        for _, e in ipairs(Window.Events) do
            c[e.level] = c[e.level] + e.count
        end
        return c
    end

    -- junta mudanças seguidas (ex.: arrastar um slider) em um único registro
    local pendingLogs, flushScheduled = {}, false
    local function logLater(key, level, message, detail)
        pendingLogs[key] = {level, message, detail}
        if not flushScheduled then
            flushScheduled = true
            task.delay(0.8, function()
                flushScheduled = false
                local batch = pendingLogs
                pendingLogs = {}
                for _, p in pairs(batch) do
                    Window:Log(p[1], p[2], p[3])
                end
            end)
        end
    end

    local multiSources = {} -- MultiDropdowns com Source (atualizados por um único laço compartilhado)

    --// ---------- Registro de recursos (Painel de Status) ----------
    Window.Features = {}
    local featureById, featureByFlag = {}, {}
    local featureListeners = {}

    function Window:RegisterFeature(def)
        if type(def) ~= "table" or not def.Name then
            return nil
        end
        local id = def.Id or def.Flag or def.Name
        local f = featureById[id]
        if f then
            if def.Probe then
                f.Probe = def.Probe
            end
            return f
        end
        f = {Id = id, Name = def.Name, Group = def.Group or "Geral", Flag = def.Flag, Probe = def.Probe}
        table.insert(Window.Features, f)
        featureById[id] = f
        if f.Flag then
            featureByFlag[f.Flag] = f
        end
        for _, fn in ipairs(featureListeners) do
            pcall(fn, f)
        end
        return f
    end

    -- liga uma "sonda" (estado real da execução) a um recurso já registrado
    function Window:Monitor(idOrFlag, probe)
        local f = featureById[idOrFlag] or featureByFlag[idOrFlag]
        if f and type(probe) == "function" then
            f.Probe = probe
            return true
        end
        return false
    end

    function Window:OnFeature(fn)
        table.insert(featureListeners, fn)
    end

    -- state: active | waiting | inactive | error | unmonitored (nunca presume que "ligado" = funcionando)
    function Window:GetFeatureState(f)
        local control = nil
        if f.Flag then
            control = Window.Flags[f.Flag]
        end
        if f.Probe then
            local ok, s, d = pcall(f.Probe, control)
            if ok and (s == "active" or s == "waiting" or s == "inactive" or s == "error") then
                return s, d ~= nil and tostring(d) or nil, control
            end
            return "error", ok and "a sonda devolveu um valor inválido" or tostring(s), control
        end
        local detail
        if control == true then
            detail = "ligado; execução não monitorada"
        elseif control == false then
            detail = "desligado"
        end
        return "unmonitored", detail, control
    end

    function Window:FeatureCounts()
        local c = {total = #Window.Features, active = 0, inactive = 0, waiting = 0, error = 0, unmonitored = 0, unmonitoredOn = 0}
        for _, f in ipairs(Window.Features) do
            local s, _, control = Window:GetFeatureState(f)
            c[s] = c[s] + 1
            if s == "unmonitored" and control == true then
                c.unmonitoredOn = c.unmonitoredOn + 1
            end
        end
        return c
    end

    --// ---------- Barramento de mudanças (compartilhado por Status, Eventos e MultiDropdown) ----------
    local changeListeners = {}
    local watch, lastState = {}, {}

    function Window:OnChange(fn)
        table.insert(changeListeners, fn)
    end

    local function valuesEqual(a, b)
        if a == b then
            return true
        end
        if type(a) == "table" and type(b) == "table" then
            if #a ~= #b then
                return false
            end
            for i = 1, #a do
                if a[i] ~= b[i] then
                    return false
                end
            end
            return true
        end
        return false
    end

    local function setFlag(flag, value)
        if not flag then
            return
        end
        local old = Window.Flags[flag]
        Window.Flags[flag] = value
        if not valuesEqual(old, value) then
            for _, fn in ipairs(changeListeners) do
                local ok, err = pcall(fn, flag, value, old)
                if not ok then
                    warn("[NovaUI] observador de mudanças: " .. tostring(err))
                end
            end
        end
    end

    local function fmtValue(v)
        if type(v) == "number" then
            return tostring(math.floor(v * 1000 + 0.5) / 1000)
        elseif type(v) == "boolean" then
            return v and "ligado" or "desligado"
        end
        return sanitize(v, 40)
    end

    -- registra alterações de configuração e pedidos de ativação/desativação
    table.insert(changeListeners, function(flag, value, old)
        if booting then
            return
        end
        local el = Window.Elements[flag]
        if el and el.NoLog then
            return -- ex.: links, que não devem aparecer no histórico
        end
        local name = (el and el.Name) or flag
        local f = featureByFlag[flag]
        if f then
            local on = value == true
            if on then
                Window:Log("INFO", f.Name .. ": ativação solicitada" .. (f.Probe and "" or " (sem monitoramento: execução não confirmável)"))
            else
                Window:Log("INFO", f.Name .. ": desativação solicitada")
            end
            if f.Probe then
                watch[f.Id] = {want = on and "on" or "off", since = os.clock()}
            else
                watch[f.Id] = nil
            end
        elseif el and el.IsMulti and type(value) == "table" then
            local oldSet = {}
            for _, v in ipairs(type(old) == "table" and old or {}) do
                oldSet[v] = true
            end
            local added, removed, newSet = 0, 0, {}
            for _, v in ipairs(value) do
                newSet[v] = true
                if not oldSet[v] then
                    added = added + 1
                end
            end
            for v in pairs(oldSet) do
                if not newSet[v] then
                    removed = removed + 1
                end
            end
            logLater("cfg:" .. flag, "INFO", string.format("Seleção em %s: %d selecionado(s)", name, #value),
                string.format("+%d / -%d", added, removed))
        else
            logLater("cfg:" .. flag, "INFO", string.format("Config: %s = %s", name, fmtValue(value)))
        end
    end)

    -- confirma (ou não) que a função realmente passou a executar/parar
    local function pollFeatures()
        local now = os.clock()
        for _, f in ipairs(Window.Features) do
            if f.Probe then
                local state, detail = Window:GetFeatureState(f)
                local w = watch[f.Id]
                if w then
                    if w.want == "on" then
                        if state == "active" then
                            Window:Log("SUCCESS", f.Name .. ": em execução", detail)
                            watch[f.Id] = nil
                        elseif state == "error" then
                            watch[f.Id] = nil
                        elseif now - w.since > 8 then
                            Window:Log("WARNING", f.Name .. ": ligado, mas sem confirmação de execução", detail)
                            watch[f.Id] = nil
                        end
                    else
                        if state ~= "active" then
                            Window:Log("SUCCESS", f.Name .. ": desativado e parado")
                            watch[f.Id] = nil
                        elseif now - w.since > 8 then
                            Window:Log("WARNING", f.Name .. ": continua ativo após o pedido de desativação", detail)
                            watch[f.Id] = nil
                        end
                    end
                end
                if state == "error" and lastState[f.Id] ~= "error" then
                    Window:Log("ERROR", f.Name .. ": erro em execução", detail)
                end
                lastState[f.Id] = state
            end
        end
    end

    function Window:EndBoot()
        booting = false
        local on = 0
        for _, f in ipairs(Window.Features) do
            if f.Flag and Window.Flags[f.Flag] == true then
                on = on + 1
                if f.Probe then
                    watch[f.Id] = {want = "on", since = os.clock()}
                end
            end
        end
        Window:Log("INFO", string.format("Interface iniciada: %d recurso(s) registrado(s), %d ligado(s) pela configuração salva.", #Window.Features, on))
        if loadErr then
            Window:Log("WARNING", "Arquivo de configuração inválido; foram usados os valores padrão", loadErr)
        end
    end

    --// ---------- Persistência ----------
    local configName = tostring(opts.ConfigName or "Default"):gsub("[^%w_%-]", "_")
    local configPath = (HAS_FOLDER and (CONFIG_FOLDER .. "/") or (CONFIG_FOLDER .. "_")) .. configName .. ".json"
    local savedConfig = {}
    if opts.SaveConfig ~= false then
        savedConfig, loadErr = loadConfig(configPath)
    end
    local savePending = false

    local function saveConfig()
        if not HAS_FS then
            return false
        end
        local ok, saveErr = pcall(function()
            local data = {}
            for flag, el in pairs(Window.Elements) do
                if not el.NoSave then
                    local v
                    if el.Serialize then
                        v = el:Serialize()
                    else
                        v = el:Get()
                    end
                    data[flag] = v
                end
            end
            writefile(configPath, HttpService:JSONEncode(data))
        end)
        if not ok then
            Window:Log("ERROR", "Falha ao gravar as configurações", tostring(saveErr))
        end
        return ok
    end

    local function queueSave()
        if not HAS_FS or savePending or not alive then
            return
        end
        savePending = true
        task.delay(0.6, function()
            savePending = false
            if alive then
                saveConfig()
            end
        end)
    end

    --// ---------- ScreenGui ----------
    local gui = new("ScreenGui", {
        Name = ROOT_NAME,
        ResetOnSpawn = false,
        IgnoreGuiInset = true,
        DisplayOrder = 999,
        ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
    })
    if not mountGui(gui) then
        gui:Destroy()
        error("[NovaUI] Não foi possível anexar a interface à tela.")
    end

    local Root = new("Frame", {
        Name = "Root",
        BackgroundTransparency = 1,
        BorderSizePixel = 0,
        Size = UDim2.fromScale(1, 1),
    }, gui)

    local function viewport()
        local s = Root.AbsoluteSize
        if s.X < 50 or s.Y < 50 then
            local cam = Workspace.CurrentCamera
            if cam then
                return cam.ViewportSize
            end
            return Vector2.new(800, 600)
        end
        return s
    end

    -- Posiciona um frame (em pixels) garantindo que fique dentro da tela.
    -- Usa posição em escala, que não é afetada por UIScale.
    local function place(frame, x, y, size)
        local vp = viewport()
        x = math.clamp(x, 0, math.max(0, vp.X - size.X))
        y = math.clamp(y, 0, math.max(0, vp.Y - size.Y))
        frame.Position = UDim2.fromScale(x / vp.X, y / vp.Y)
        return x, y
    end

    --// ---------- Sistema de arraste (janela, botão flutuante, sliders) ----------
    local function beginDrag(input, onMove, onEnd)
        if activeDrag and activeDrag.onEnd then
            pcall(activeDrag.onEnd)
        end
        activeDrag = {input = input, onMove = onMove, onEnd = onEnd}
    end

    local function matchesDrag(drag, input, ending)
        if input == drag.input then
            return true
        end
        local dt = drag.input.UserInputType
        if dt == Enum.UserInputType.Touch then
            return input.UserInputType == Enum.UserInputType.Touch
        end
        if ending then
            return input.UserInputType == Enum.UserInputType.MouseButton1
        end
        return input.UserInputType == Enum.UserInputType.MouseMovement
    end

    track(UserInputService.InputChanged:Connect(function(input)
        local d = activeDrag
        if d and matchesDrag(d, input, false) then
            d.onMove(input)
        end
    end))

    track(UserInputService.InputEnded:Connect(function(input)
        local d = activeDrag
        if d and matchesDrag(d, input, true) then
            activeDrag = nil
            if d.onEnd then
                pcall(d.onEnd)
            end
        end
    end))

    local function makeDraggable(handle, target, pos, getSize, onTap, canDrag)
        track(handle.InputBegan:Connect(function(input)
            local t = input.UserInputType
            if t ~= Enum.UserInputType.MouseButton1 and t ~= Enum.UserInputType.Touch then
                return
            end
            local startPointer = Vector2.new(input.Position.X, input.Position.Y)
            local startX, startY = pos.x, pos.y
            local moved = false
            beginDrag(input, function(cur)
                if canDrag and not canDrag() then
                    return -- Auto-Lock: bloqueia só o arraste, o toque continua valendo
                end
                local delta = Vector2.new(cur.Position.X, cur.Position.Y) - startPointer
                if not moved and delta.Magnitude < 6 then
                    return
                end
                moved = true
                pos.x, pos.y = place(target, startX + delta.X, startY + delta.Y, getSize())
            end, function()
                if not moved and onTap then
                    onTap()
                end
            end)
        end))
    end

    --// ---------- Janela principal ----------
    local SIDEBAR_W = 150
    local TOPBAR_H = 40

    local Main = new("Frame", {
        Name = "MainFrame",
        Active = true,
        BackgroundColor3 = Theme.Background,
        BorderSizePixel = 0,
    }, Root)
    corner(Main, 12)
    stroke(Main, Theme.Stroke, 1)
    local scaleObj = new("UIScale", {Scale = 1}, Main)

    local TopBar = new("Frame", {
        Name = "TopBar",
        Active = true,
        BackgroundTransparency = 1,
        Size = UDim2.new(1, 0, 0, TOPBAR_H),
    }, Main)

    local titleBox = new("Frame", {
        BackgroundTransparency = 1,
        Position = UDim2.fromOffset(14, 0),
        Size = UDim2.new(1, -96, 1, 0),
    }, TopBar)
    new("UIListLayout", {
        FillDirection = Enum.FillDirection.Horizontal,
        VerticalAlignment = Enum.VerticalAlignment.Center,
        Padding = UDim.new(0, 8),
        SortOrder = Enum.SortOrder.LayoutOrder,
    }, titleBox)

    local dot = new("Frame", {
        Size = UDim2.fromOffset(8, 8),
        BackgroundColor3 = Theme.Accent,
        BorderSizePixel = 0,
        LayoutOrder = 1,
    }, titleBox)
    corner(dot, 4)
    bindAccent(function()
        dot.BackgroundColor3 = Theme.Accent
    end)

    makeLabel(titleBox, opts.Title or "Nova UI", {
        Font = FONT_BOLD,
        TextSize = 15,
        AutomaticSize = Enum.AutomaticSize.X,
        Size = UDim2.new(0, 0, 1, 0),
        LayoutOrder = 2,
    })
    makeLabel(titleBox, opts.SubTitle or "", {
        TextSize = 12,
        TextColor3 = Theme.SubText,
        AutomaticSize = Enum.AutomaticSize.X,
        Size = UDim2.new(0, 0, 1, 0),
        LayoutOrder = 3,
    })

    local closeBtn = new("TextButton", {
        Name = "Close",
        AnchorPoint = Vector2.new(1, 0.5),
        Position = UDim2.new(1, -8, 0.5, 0),
        Size = UDim2.fromOffset(30, 30),
        BackgroundColor3 = Theme.Element,
        BorderSizePixel = 0,
        AutoButtonColor = false,
        Text = "X",
        Font = FONT_BOLD,
        TextSize = 13,
        TextColor3 = Theme.SubText,
    }, TopBar)
    corner(closeBtn, 8)
    closeBtn.MouseEnter:Connect(function()
        tween(closeBtn, 0.1, {BackgroundColor3 = Color3.fromRGB(220, 70, 80), TextColor3 = Color3.new(1, 1, 1)})
    end)
    closeBtn.MouseLeave:Connect(function()
        tween(closeBtn, 0.1, {BackgroundColor3 = Theme.Element, TextColor3 = Theme.SubText})
    end)

    local minBtn = new("TextButton", {
        Name = "Minimize",
        AnchorPoint = Vector2.new(1, 0.5),
        Position = UDim2.new(1, -44, 0.5, 0),
        Size = UDim2.fromOffset(30, 30),
        BackgroundColor3 = Theme.Element,
        BorderSizePixel = 0,
        AutoButtonColor = false,
        Text = "—",
        Font = FONT_BOLD,
        TextSize = 13,
        TextColor3 = Theme.Accent,
    }, TopBar)
    corner(minBtn, 8)

    new("Frame", {
        BackgroundColor3 = Theme.Stroke,
        BorderSizePixel = 0,
        Position = UDim2.fromOffset(0, TOPBAR_H),
        Size = UDim2.new(1, 0, 0, 1),
    }, Main)

    local Sidebar = new("ScrollingFrame", {
        Name = "Sidebar",
        BackgroundTransparency = 1,
        BorderSizePixel = 0,
        Position = UDim2.fromOffset(0, TOPBAR_H + 1),
        Size = UDim2.new(0, SIDEBAR_W, 1, -(TOPBAR_H + 1)),
        ScrollBarThickness = 0,
        CanvasSize = UDim2.new(),
        AutomaticCanvasSize = Enum.AutomaticSize.Y,
        ScrollingDirection = Enum.ScrollingDirection.Y,
    }, Main)
    new("UIListLayout", {Padding = UDim.new(0, 4), SortOrder = Enum.SortOrder.LayoutOrder}, Sidebar)
    padding(Sidebar, 8, 8, 8, 8)

    new("Frame", {
        BackgroundColor3 = Theme.Stroke,
        BorderSizePixel = 0,
        Position = UDim2.fromOffset(SIDEBAR_W, TOPBAR_H + 1),
        Size = UDim2.new(0, 1, 1, -(TOPBAR_H + 1)),
    }, Main)

    local Content = new("Frame", {
        Name = "Content",
        BackgroundTransparency = 1,
        BorderSizePixel = 0,
        ClipsDescendants = true,
        Position = UDim2.fromOffset(SIDEBAR_W + 1, TOPBAR_H + 1),
        Size = UDim2.new(1, -(SIDEBAR_W + 1), 1, -(TOPBAR_H + 1)),
    }, Main)

    local minimized = false
    local fullH = 490
    local function autoScale()
        return math.clamp(viewport().Y / 600, 0.3, 3) * userScale
    end
    local function fitWindow()
        local vp = viewport()
        local sc = autoScale()
        local w = math.max(math.min(720, (vp.X - 16) / sc), 260)
        local h = math.max(math.min(490, (vp.Y - 16) / sc), 200)
        fullH = h
        local curH = minimized and (TOPBAR_H + 1) or h
        Main.Size = UDim2.fromOffset(w, curH)
        scaleObj.Scale = sc
        mainSize = Vector2.new(w * sc, curH * sc)
        mainPos.x, mainPos.y = place(Main, mainPos.x, mainPos.y, mainSize)
    end

    makeDraggable(TopBar, Main, mainPos, function()
        return mainSize
    end)

    --// ---------- Botão flutuante ----------
    local LAUNCHER_SIZE = Vector2.new(52, 52)
    local Launcher = new("ImageButton", {
        Name = "FloatClick",
        Size = UDim2.fromOffset(LAUNCHER_SIZE.X, LAUNCHER_SIZE.Y),
        BackgroundColor3 = Theme.Accent,
        BorderSizePixel = 0,
        AutoButtonColor = false,
        ScaleType = Enum.ScaleType.Crop,
        ZIndex = 5,
    }, Root)
    Launcher.Image = "rbxassetid://133657192115931"
    new("UICorner", {CornerRadius = UDim.new(1, 0)}, Launcher)
    local function fitLauncher()
        local s = math.floor(math.clamp(viewport().Y / 600, 0.3, 3) * 64 + 0.5)
        s = math.max(s, 40)
        LAUNCHER_SIZE = Vector2.new(s, s)
        Launcher.Size = UDim2.fromOffset(s, s)
    end
    fitLauncher()
    stroke(Launcher, Color3.new(1, 1, 1), 1, 0.75)
    bindAccent(function()
        Launcher.BackgroundColor3 = Theme.Accent
    end)

    --// ---------- Notificações ----------
    local notifHolder = new("Frame", {
        Name = "Notifications",
        AnchorPoint = Vector2.new(0.5, 0),
        Position = UDim2.new(0.5, 0, 0, 10),
        Size = UDim2.new(0, 260, 1, -20),
        BackgroundTransparency = 1,
        ZIndex = 10,
    }, Root)
    new("UIListLayout", {
        Padding = UDim.new(0, 6),
        SortOrder = Enum.SortOrder.LayoutOrder,
        HorizontalAlignment = Enum.HorizontalAlignment.Center,
    }, notifHolder)

    --// ---------- Componentes ----------
    local SectionMT = {}
    SectionMT.__index = SectionMT

    function SectionMT:_nextOrder()
        self._order = self._order + 1
        return self._order
    end

    function SectionMT:_row(height)
        local row = new("Frame", {
            BackgroundColor3 = Theme.Element,
            BackgroundTransparency = 0.2,
            BorderSizePixel = 0,
            Size = UDim2.new(1, 0, 0, height or ROW_H),
            LayoutOrder = self:_nextOrder(),
        }, self._frame)
        corner(row, 6)
        return row
    end

    -- Registra o elemento, restaura valor salvo e conecta com a persistência.
    local function finalize(el, opts2)
        local flag = opts2.Flag
        el.Name = el.Name or opts2.Name
        el.NoSave = opts2.NoSave
        el.NoLog = opts2.NoLog
        if flag then
            el.Flag = flag
            Window.Elements[flag] = el
            local saved = savedConfig[flag]
            if opts2.NoSave then
                saved = nil -- ações momentâneas (gravar/reproduzir) nunca iniciam sozinhas
            end
            if saved ~= nil then
                local ok, err = pcall(el.Set, el, saved, false)
                if not ok then
                    warn("[NovaUI] Valor salvo inválido em '" .. flag .. "': " .. tostring(err))
                    setFlag(flag, el:Get())
                end
            else
                setFlag(flag, el:Get())
                if opts2.CallOnInit then
                    fire(opts2.Callback, el:Get())
                end
            end
        elseif opts2.CallOnInit then
            fire(opts2.Callback, el:Get())
        end
        return el
    end

    function SectionMT:AddLabel(text)
        local lbl = makeLabel(self._frame, tostring(text or ""), {
            Size = UDim2.new(1, 0, 0, 0),
            AutomaticSize = Enum.AutomaticSize.Y,
            TextWrapped = true,
            TextSize = 12,
            TextColor3 = Theme.SubText,
            LayoutOrder = self:_nextOrder(),
        })
        padding(lbl, 4, 2, 4, 2)
        local el = {}
        function el:Set(t)
            lbl.Text = tostring(t)
        end
        function el:Get()
            return lbl.Text
        end
        return el
    end

    function SectionMT:AddButton(opts2)
        opts2 = opts2 or {}
        local row = self:_row(ROW_H)
        local btn = new("TextButton", {
            Size = UDim2.fromScale(1, 1),
            BackgroundTransparency = 1,
            AutoButtonColor = false,
            Text = opts2.Name or "Botão",
            Font = FONT,
            TextSize = 13,
            TextColor3 = Theme.Text,
        }, row)
        local hv = hoverEffect(row, btn)
        btn.MouseButton1Click:Connect(function()
            row.BackgroundColor3 = Theme.Accent
            tween(row, 0.3, {BackgroundColor3 = hv.over and Theme.ElementHover or Theme.Element})
            fire(opts2.Callback)
        end)
        local el = {}
        function el:SetText(t)
            btn.Text = tostring(t)
        end
        return el
    end

    function SectionMT:AddToggle(opts2)
        opts2 = opts2 or {}
        local value = opts2.Default == true
        local row = self:_row(ROW_H)
        makeLabel(row, opts2.Name or "Toggle", {
            Position = UDim2.fromOffset(12, 0),
            Size = UDim2.new(1, -72, 1, 0),
            TextTruncate = Enum.TextTruncate.AtEnd,
        })
        local switchBg = new("Frame", {
            AnchorPoint = Vector2.new(1, 0.5),
            Position = UDim2.new(1, -12, 0.5, 0),
            Size = UDim2.fromOffset(40, 20),
            BackgroundColor3 = Theme.Off,
            BorderSizePixel = 0,
        }, row)
        corner(switchBg, 10)
        local knob = new("Frame", {
            AnchorPoint = Vector2.new(0, 0.5),
            Position = UDim2.new(0, 3, 0.5, 0),
            Size = UDim2.fromOffset(14, 14),
            BackgroundColor3 = Color3.new(1, 1, 1),
            BorderSizePixel = 0,
        }, switchBg)
        corner(knob, 7)
        local click = new("TextButton", {
            BackgroundTransparency = 1,
            Size = UDim2.fromScale(1, 1),
            Text = "",
            ZIndex = 2,
        }, row)
        hoverEffect(row, click)

        local function render(animate)
            local goalPos = value and UDim2.new(1, -17, 0.5, 0) or UDim2.new(0, 3, 0.5, 0)
            local goalColor = value and Theme.Accent or Theme.Off
            if animate then
                tween(knob, 0.15, {Position = goalPos})
                tween(switchBg, 0.15, {BackgroundColor3 = goalColor})
            else
                knob.Position = goalPos
                switchBg.BackgroundColor3 = goalColor
            end
        end
        bindAccent(function()
            if value then
                switchBg.BackgroundColor3 = Theme.Accent
            end
        end)

        local el = {Default = opts2.Default == true}
        function el:Get()
            return value
        end
        function el:Set(v, silent)
            value = v == true
            render(true)
            setFlag(opts2.Flag, value)
            if not silent then
                fire(opts2.Callback, value)
                queueSave()
            end
        end
        click.MouseButton1Click:Connect(function()
            el:Set(not value, false)
        end)
        render(false)
        if opts2.Flag and opts2.Feature ~= false then
            Window:RegisterFeature({
                Id = opts2.Flag, Name = opts2.Name or opts2.Flag, Group = self._tabName,
                Flag = opts2.Flag, Probe = opts2.Probe,
            })
        end
        return finalize(el, opts2)
    end

    function SectionMT:AddSlider(opts2)
        opts2 = opts2 or {}
        local minV, maxV = opts2.Min or 0, opts2.Max or 100
        local step = opts2.Step or 1
        local suffix = opts2.Suffix or ""
        local page = self._page

        local function snap(v)
            local s = roundTo(v - minV, step) + minV
            return math.clamp(tonumber(string.format("%.4f", s)), minV, maxV)
        end

        local value = snap(opts2.Default or minV)
        local row = self:_row(52)
        makeLabel(row, opts2.Name or "Slider", {
            Position = UDim2.fromOffset(12, 6),
            Size = UDim2.new(1, -90, 0, 20),
            TextTruncate = Enum.TextTruncate.AtEnd,
        })
        local valueLabel = makeLabel(row, "", {
            AnchorPoint = Vector2.new(1, 0),
            Position = UDim2.new(1, -12, 0, 6),
            Size = UDim2.fromOffset(70, 20),
            TextXAlignment = Enum.TextXAlignment.Right,
            TextColor3 = Theme.SubText,
        })
        local bar = new("Frame", {
            Position = UDim2.new(0, 12, 0, 36),
            Size = UDim2.new(1, -24, 0, 6),
            BackgroundColor3 = Theme.Off,
            BorderSizePixel = 0,
        }, row)
        corner(bar, 3)
        local fill = new("Frame", {
            Size = UDim2.new(0, 0, 1, 0),
            BackgroundColor3 = Theme.Accent,
            BorderSizePixel = 0,
        }, bar)
        corner(fill, 3)
        local knob = new("Frame", {
            AnchorPoint = Vector2.new(0.5, 0.5),
            Position = UDim2.new(0, 0, 0.5, 0),
            Size = UDim2.fromOffset(14, 14),
            BackgroundColor3 = Color3.new(1, 1, 1),
            BorderSizePixel = 0,
        }, bar)
        corner(knob, 7)
        bindAccent(function()
            fill.BackgroundColor3 = Theme.Accent
        end)
        local hit = new("TextButton", {
            BackgroundTransparency = 1,
            Position = UDim2.fromOffset(0, 24),
            Size = UDim2.new(1, 0, 0, 28),
            Text = "",
            ZIndex = 2,
        }, row)

        local function render()
            local range = maxV - minV
            local a = range > 0 and math.clamp((value - minV) / range, 0, 1) or 0
            fill.Size = UDim2.new(a, 0, 1, 0)
            knob.Position = UDim2.new(a, 0, 0.5, 0)
            valueLabel.Text = tostring(value) .. suffix
        end

        local el = {Default = snap(opts2.Default or minV)}
        function el:Get()
            return value
        end
        function el:Set(v, silent)
            value = snap(tonumber(v) or value)
            render()
            setFlag(opts2.Flag, value)
            if not silent then
                fire(opts2.Callback, value)
                queueSave()
            end
        end

        hit.InputBegan:Connect(function(input)
            local t = input.UserInputType
            if t ~= Enum.UserInputType.MouseButton1 and t ~= Enum.UserInputType.Touch then
                return
            end
            page.ScrollingEnabled = false
            local function apply(cur)
                local a = math.clamp((cur.Position.X - bar.AbsolutePosition.X) / math.max(bar.AbsoluteSize.X, 1), 0, 1)
                local nv = snap(minV + (maxV - minV) * a)
                if nv ~= value then
                    el:Set(nv, false)
                end
            end
            apply(input)
            beginDrag(input, apply, function()
                page.ScrollingEnabled = true
            end)
        end)

        render()
        return finalize(el, opts2)
    end

    function SectionMT:AddInput(opts2)
        opts2 = opts2 or {}
        local numeric = opts2.Numeric == true
        local minV, maxV = opts2.Min, opts2.Max
        local value

        local row = self:_row(ROW_H)
        makeLabel(row, opts2.Name or "Entrada", {
            Position = UDim2.fromOffset(12, 0),
            Size = UDim2.new(0.5, -12, 1, 0),
            TextTruncate = Enum.TextTruncate.AtEnd,
        })
        local box = new("TextBox", {
            AnchorPoint = Vector2.new(1, 0.5),
            Position = UDim2.new(1, -6, 0.5, 0),
            Size = UDim2.new(0.5, -6, 1, -12),
            BackgroundColor3 = Theme.Background,
            BorderSizePixel = 0,
            ClearTextOnFocus = false,
            ClipsDescendants = true,
            Text = "",
            PlaceholderText = opts2.Placeholder or "Digite...",
            PlaceholderColor3 = Theme.SubText,
            TextColor3 = Theme.Text,
            Font = FONT,
            TextSize = 13,
            TextXAlignment = Enum.TextXAlignment.Center,
        }, row)
        corner(box, 5)
        local boxStroke = stroke(box, Theme.Stroke, 1)
        box.Focused:Connect(function()
            boxStroke.Color = Theme.Accent
        end)

        local function coerce(raw)
            raw = tostring(raw)
            if numeric then
                local n = tonumber(raw)
                if not n then
                    return nil
                end
                if minV then
                    n = math.max(minV, n)
                end
                if maxV then
                    n = math.min(maxV, n)
                end
                return n
            end
            if opts2.Validate then
                local okCall, result = pcall(opts2.Validate, raw)
                if okCall then
                    return result
                end
                return nil
            end
            return raw
        end

        local fallback = numeric and (minV or 0) or ""
        local default = opts2.Default
        if default == nil then
            default = fallback
        end
        value = coerce(default)
        if value == nil then
            value = fallback
        end
        box.Text = tostring(value)

        local el = {Default = value}
        function el:Get()
            return value
        end
        function el:Set(v, silent)
            local c = coerce(v)
            if c == nil then
                box.Text = tostring(value)
                return
            end
            value = c
            box.Text = tostring(value)
            setFlag(opts2.Flag, value)
            if not silent then
                fire(opts2.Callback, value)
                queueSave()
            end
        end

        box.FocusLost:Connect(function()
            boxStroke.Color = Theme.Stroke
            local c = coerce(box.Text)
            if c == nil or c == value then
                box.Text = tostring(value)
            else
                el:Set(c, false)
            end
        end)

        return finalize(el, opts2)
    end


    function SectionMT:AddColorPicker(opts2)
        opts2 = opts2 or {}
        local PICK_H = 136
        local function parse(raw)
            if typeof(raw) == "Color3" then
                return raw
            end
            local r, g, b = tostring(raw):match("^%s*(%d+)%s*[,;%s]%s*(%d+)%s*[,;%s]%s*(%d+)%s*$")
            if r then
                return Color3.fromRGB(math.min(tonumber(r), 255), math.min(tonumber(g), 255), math.min(tonumber(b), 255))
            end
            return nil
        end
        local function fmt(c)
            return string.format("%d, %d, %d", math.floor(c.R * 255 + 0.5), math.floor(c.G * 255 + 0.5), math.floor(c.B * 255 + 0.5))
        end

        local color = parse(opts2.Default) or Color3.fromRGB(255, 0, 0)
        local h, s, v = color:ToHSV()
        local open = false
        local page = self._page

        local row = self:_row(ROW_H)
        row.ClipsDescendants = true
        makeLabel(row, opts2.Name or "Cor", {
            Position = UDim2.fromOffset(12, 0),
            Size = UDim2.new(1, -70, 0, ROW_H),
            TextTruncate = Enum.TextTruncate.AtEnd,
        })
        local swatch = new("Frame", {
            AnchorPoint = Vector2.new(1, 0),
            Position = UDim2.new(1, -12, 0, (ROW_H - 20) / 2),
            Size = UDim2.fromOffset(40, 20),
            BackgroundColor3 = color,
            BorderSizePixel = 0,
        }, row)
        corner(swatch, 6)
        stroke(swatch, Theme.Stroke, 1)
        local head = new("TextButton", {
            BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, ROW_H), Text = "", ZIndex = 2,
        }, row)
        hoverEffect(row, head)

        local body = new("Frame", {
            BackgroundTransparency = 1, Position = UDim2.fromOffset(10, ROW_H), Size = UDim2.new(1, -20, 0, PICK_H - 12),
            Visible = false,
        }, row)
        local sv = new("Frame", {Size = UDim2.new(1, -28, 1, 0), BackgroundColor3 = Color3.fromHSV(h, 1, 1), BorderSizePixel = 0}, body)
        corner(sv, 6)
        local white = new("Frame", {Size = UDim2.fromScale(1, 1), BackgroundColor3 = Color3.new(1, 1, 1), BorderSizePixel = 0, ZIndex = 2}, sv)
        corner(white, 6)
        new("UIGradient", {Transparency = NumberSequence.new({NumberSequenceKeypoint.new(0, 0), NumberSequenceKeypoint.new(1, 1)})}, white)
        local black = new("Frame", {Size = UDim2.fromScale(1, 1), BackgroundColor3 = Color3.new(0, 0, 0), BorderSizePixel = 0, ZIndex = 3}, sv)
        corner(black, 6)
        new("UIGradient", {
            Rotation = 90,
            Transparency = NumberSequence.new({NumberSequenceKeypoint.new(0, 1), NumberSequenceKeypoint.new(1, 0)}),
        }, black)
        local cursor = new("Frame", {
            AnchorPoint = Vector2.new(0.5, 0.5), Size = UDim2.fromOffset(12, 12), BackgroundColor3 = Color3.new(1, 1, 1),
            BorderSizePixel = 0, ZIndex = 5,
        }, sv)
        corner(cursor, 6)
        stroke(cursor, Color3.new(0, 0, 0), 1.5)

        local hue = new("Frame", {
            AnchorPoint = Vector2.new(1, 0), Position = UDim2.new(1, 0, 0, 0), Size = UDim2.new(0, 20, 1, 0),
            BackgroundColor3 = Color3.new(1, 1, 1), BorderSizePixel = 0,
        }, body)
        corner(hue, 6)
        local keys = {}
        for i = 0, 6 do
            table.insert(keys, ColorSequenceKeypoint.new(i / 6, Color3.fromHSV(i / 6, 1, 1)))
        end
        new("UIGradient", {Rotation = 270, Color = ColorSequence.new(keys)}, hue)
        local hueCursor = new("Frame", {
            AnchorPoint = Vector2.new(0.5, 0.5), Size = UDim2.new(1, 4, 0, 6), BackgroundColor3 = Color3.new(1, 1, 1),
            BorderSizePixel = 0, ZIndex = 5,
        }, hue)
        corner(hueCursor, 3)
        stroke(hueCursor, Color3.new(0, 0, 0), 1.5)

        local el = {Default = fmt(color)}
        local function render()
            color = Color3.fromHSV(h, s, v)
            swatch.BackgroundColor3 = color
            sv.BackgroundColor3 = Color3.fromHSV(h, 1, 1)
            cursor.Position = UDim2.fromScale(s, 1 - v)
            hueCursor.Position = UDim2.new(0.5, 0, 1 - h, 0)
        end
        local function commit(silent)
            render()
            setFlag(opts2.Flag, fmt(color))
            if not silent then
                fire(opts2.Callback, fmt(color))
                queueSave()
            end
        end
        function el:Get()
            return fmt(color)
        end
        function el:Set(val, silent)
            local c = parse(val)
            if not c then
                return
            end
            h, s, v = c:ToHSV()
            commit(silent)
        end

        local function bindDrag(target, onMove)
            target.InputBegan:Connect(function(input)
                local t = input.UserInputType
                if t ~= Enum.UserInputType.MouseButton1 and t ~= Enum.UserInputType.Touch then
                    return
                end
                page.ScrollingEnabled = false
                onMove(input)
                beginDrag(input, onMove, function()
                    page.ScrollingEnabled = true
                end)
            end)
        end
        bindDrag(sv, function(inp)
            local p, sz = sv.AbsolutePosition, sv.AbsoluteSize
            s = math.clamp((inp.Position.X - p.X) / math.max(sz.X, 1), 0, 1)
            v = 1 - math.clamp((inp.Position.Y - p.Y) / math.max(sz.Y, 1), 0, 1)
            commit(false)
        end)
        bindDrag(hue, function(inp)
            local p, sz = hue.AbsolutePosition, hue.AbsoluteSize
            h = 1 - math.clamp((inp.Position.Y - p.Y) / math.max(sz.Y, 1), 0, 1)
            commit(false)
        end)
        head.MouseButton1Click:Connect(function()
            open = not open
            body.Visible = open
            row.Size = UDim2.new(1, 0, 0, open and (ROW_H + PICK_H) or ROW_H)
        end)

        render()
        return finalize(el, opts2)
    end

    function SectionMT:AddMultiDropdown(opts2)
        opts2 = opts2 or {}
        local ITEM_H, GAP, MAX_VISIBLE, MAX_RENDER = 28, 3, 6, 300
        local sortList = opts2.Sort
        if sortList == nil then
            sortList = opts2.Source ~= nil
        end

        local function normalize(list) -- sem nomes repetidos (só o primeiro de cada nome)
            local out, seen = {}, {}
            if type(list) == "table" then
                for _, o in ipairs(list) do
                    local s = tostring(o)
                    if s ~= "" and not seen[s] then
                        seen[s] = true
                        table.insert(out, s)
                    end
                end
            end
            if sortList then
                table.sort(out)
            end
            return out, seen
        end
        local function listsEqual(a, b)
            if #a ~= #b then
                return false
            end
            for i = 1, #a do
                if a[i] ~= b[i] then
                    return false
                end
            end
            return true
        end
        local function copy(t)
            local out = {}
            for i, v in ipairs(t) do
                out[i] = v
            end
            return out
        end

        local options, optionSet = normalize(opts2.Options)
        local selected = {}
        local query = ""
        local isOpen = false
        local rows = {}
        local lastCommitted = {}
        local el = {IsMulti = true, Name = opts2.Name}

        local function selectedList()
            local out = {}
            if #options > 0 then
                for _, o in ipairs(options) do
                    if selected[o] then
                        table.insert(out, o)
                    end
                end
            else -- lista vazia: mantém as seleções salvas como pendentes (não dá para validá-las agora)
                for name in pairs(selected) do
                    table.insert(out, name)
                end
                table.sort(out)
            end
            return out
        end

        local function filtered()
            local out = {}
            for _, o in ipairs(options) do
                if query == "" or o:lower():find(query, 1, true) then
                    table.insert(out, o)
                end
            end
            return out
        end

        --// interface
        local wrapper = new("Frame", {
            BackgroundColor3 = Theme.Element,
            BackgroundTransparency = 0.2,
            BorderSizePixel = 0,
            ClipsDescendants = true,
            Size = UDim2.new(1, 0, 0, ROW_H),
            LayoutOrder = self:_nextOrder(),
        }, self._frame)
        corner(wrapper, 6)
        makeLabel(wrapper, opts2.Name or "Lista", {
            Position = UDim2.fromOffset(12, 0),
            Size = UDim2.new(0.5, -12, 0, ROW_H),
            TextTruncate = Enum.TextTruncate.AtEnd,
        })
        local valueLabel = makeLabel(wrapper, "", {
            Position = UDim2.new(0.5, 0, 0, 0),
            Size = UDim2.new(0.5, -30, 0, ROW_H),
            TextXAlignment = Enum.TextXAlignment.Right,
            TextColor3 = Theme.SubText,
            TextTruncate = Enum.TextTruncate.AtEnd,
        })
        local arrow = makeLabel(wrapper, ">", {
            Position = UDim2.new(1, -24, 0, 0),
            Size = UDim2.fromOffset(16, ROW_H),
            TextXAlignment = Enum.TextXAlignment.Center,
            TextColor3 = Theme.SubText,
            Font = FONT_BOLD,
        })
        local header = new("TextButton", {
            BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, ROW_H), Text = "", ZIndex = 2,
        }, wrapper)
        header.MouseEnter:Connect(function()
            tween(wrapper, 0.1, {BackgroundColor3 = Theme.ElementHover})
        end)
        header.MouseLeave:Connect(function()
            tween(wrapper, 0.1, {BackgroundColor3 = Theme.Element})
        end)

        local searchBox
        if opts2.Searchable ~= false then
            searchBox = new("TextBox", {
                Position = UDim2.new(0, 6, 0, ROW_H + 4), Size = UDim2.new(1, -12, 0, 28),
                BackgroundColor3 = Theme.Background, BorderSizePixel = 0, ClearTextOnFocus = false,
                PlaceholderText = "Pesquisar...", PlaceholderColor3 = Theme.SubText, Text = "",
                Font = FONT, TextSize = 13, TextColor3 = Theme.Text, TextXAlignment = Enum.TextXAlignment.Left,
            }, wrapper)
            corner(searchBox, 6)
            padding(searchBox, 8, 0, 8, 0)
        end
        local barY = ROW_H + 36
        local function smallButton(text, x)
            local b = new("TextButton", {
                Position = UDim2.new(0, x, 0, barY), Size = UDim2.fromOffset(70, 26), BackgroundColor3 = Theme.Background,
                BorderSizePixel = 0, AutoButtonColor = true, Text = text, Font = FONT_BOLD, TextSize = 12,
                TextColor3 = Theme.Text,
            }, wrapper)
            corner(b, 6)
            return b
        end
        local allBtn = smallButton("Todos", 6)
        local clearBtn = smallButton("Limpar", 82)
        local countLabel = makeLabel(wrapper, "", {
            Position = UDim2.new(0, 158, 0, barY), Size = UDim2.new(1, -170, 0, 26),
            TextXAlignment = Enum.TextXAlignment.Right, TextColor3 = Theme.SubText, TextSize = 12,
        })
        local listY = barY + 32
        local list = new("ScrollingFrame", {
            Position = UDim2.new(0, 6, 0, listY), Size = UDim2.new(1, -12, 0, 0), BackgroundColor3 = Theme.Background,
            BorderSizePixel = 0, ScrollBarThickness = 3, CanvasSize = UDim2.new(),
            AutomaticCanvasSize = Enum.AutomaticSize.Y, ScrollingDirection = Enum.ScrollingDirection.Y,
        }, wrapper)
        corner(list, 6)
        new("UIListLayout", {Padding = UDim.new(0, GAP), SortOrder = Enum.SortOrder.LayoutOrder}, list)
        padding(list, 3, 3, 3, 3)

        local function listHeight()
            local n = math.min(math.max(#options, 1), MAX_VISIBLE)
            return n * (ITEM_H + GAP) + 3
        end
        local function openHeight()
            return listY + listHeight() + 6
        end

        local function summary()
            local sel = selectedList()
            if #sel == 0 then
                return opts2.Placeholder or "Nenhum"
            elseif #sel <= 2 then
                return table.concat(sel, ", ")
            end
            return #sel .. " selecionados"
        end

        local function refreshVisuals()
            valueLabel.Text = summary()
            countLabel.Text = #selectedList() .. "/" .. #options
            for name, r in pairs(rows) do
                local on = selected[name] == true
                r.box.BackgroundColor3 = on and Theme.Accent or Theme.Off
                r.label.TextColor3 = on and Theme.Accent or Theme.Text
                r.btn.BackgroundColor3 = on and Theme.ElementHover or Theme.Element
            end
        end
        bindAccent(refreshVisuals)

        local commit
        local function rebuild()
            for _, c in ipairs(list:GetChildren()) do
                if c:IsA("GuiObject") then
                    c:Destroy()
                end
            end
            rows = {}
            local shown = filtered()
            if #shown == 0 then
                makeLabel(list, #options == 0 and "Sem opções" or "Nenhum resultado", {
                    Size = UDim2.new(1, 0, 0, ITEM_H), TextXAlignment = Enum.TextXAlignment.Center,
                    TextColor3 = Theme.SubText, TextSize = 12,
                })
            end
            for i = 1, math.min(#shown, MAX_RENDER) do
                local name = shown[i]
                local btn = new("TextButton", {
                    LayoutOrder = i, Size = UDim2.new(1, 0, 0, ITEM_H), BackgroundColor3 = Theme.Element,
                    BorderSizePixel = 0, AutoButtonColor = false, Text = "",
                }, list)
                corner(btn, 5)
                local box = new("Frame", {
                    AnchorPoint = Vector2.new(0, 0.5), Position = UDim2.new(0, 8, 0.5, 0), Size = UDim2.fromOffset(14, 14),
                    BackgroundColor3 = Theme.Off, BorderSizePixel = 0,
                }, btn)
                corner(box, 4)
                local label = makeLabel(btn, name, {
                    Position = UDim2.fromOffset(30, 0), Size = UDim2.new(1, -36, 1, 0), TextSize = 13,
                    TextTruncate = Enum.TextTruncate.AtEnd,
                })
                rows[name] = {btn = btn, box = box, label = label}
                btn.MouseButton1Click:Connect(function()
                    selected[name] = (not selected[name]) or nil
                    commit(false)
                end)
            end
            list.Size = UDim2.new(1, -12, 0, listHeight())
            if isOpen then
                wrapper.Size = UDim2.new(1, 0, 0, openHeight())
            end
            refreshVisuals()
        end

        commit = function(silent)
            local cur = selectedList()
            refreshVisuals()
            local changed = not listsEqual(cur, lastCommitted)
            lastCommitted = copy(cur)
            setFlag(opts2.Flag, copy(cur))
            if changed and not silent then
                fire(opts2.Callback, copy(cur))
                queueSave()
            end
            return changed
        end

        function el:Get()
            return selectedList()
        end
        function el:Serialize()
            return selectedList()
        end
        function el:GetOptions()
            return copy(options)
        end
        function el:IsOpen()
            return isOpen
        end
        function el:Set(values, silent)
            local new = {}
            if type(values) == "string" then
                values = {values}
            end
            if type(values) == "table" then
                for _, v in ipairs(values) do
                    local s = tostring(v)
                    if #options == 0 or optionSet[s] then -- opção inexistente é ignorada (ou pendente se a lista está vazia)
                        new[s] = true
                    end
                end
            end
            selected = new
            return commit(silent)
        end
        function el:SelectAll(silent)
            for _, o in ipairs(filtered()) do
                selected[o] = true
            end
            return commit(silent)
        end
        function el:Clear(silent)
            if query ~= "" then
                for _, o in ipairs(filtered()) do
                    selected[o] = nil
                end
            else
                selected = {}
            end
            return commit(silent)
        end

        -- Atualiza as opções sem recriar a interface. Sem argumento usa a Source.
        -- Mantém as seleções que ainda existem; lista vazia vinda da Source mantém as seleções como pendentes.
        function el:Refresh(newOptions, force)
            local source = newOptions
            if source == nil and opts2.Source then
                local ok, res = pcall(opts2.Source)
                if not ok then
                    Window:Log("ERROR", (opts2.Name or "Lista") .. ": erro ao atualizar as opções", tostring(res))
                    return false, #options
                end
                source = res
            end
            local new, seen = normalize(source)
            local optionsChanged = not listsEqual(new, options)
            options, optionSet = new, seen
            local removed = 0
            if #new > 0 then
                for name in pairs(selected) do
                    if not seen[name] then
                        selected[name] = nil
                        removed = removed + 1
                    end
                end
            elseif force then
                for _ in pairs(selected) do
                    removed = removed + 1
                end
                selected = {}
            end
            if optionsChanged then
                rebuild()
            end
            local changed = false
            if removed > 0 then
                changed = commit(false)
            else
                refreshVisuals()
            end
            if optionsChanged and not booting then
                logLater("opt:" .. tostring(opts2.Flag or opts2.Name), "INFO",
                    string.format("%s: lista atualizada (%d opções)", opts2.Name or "Lista", #new),
                    removed > 0 and (removed .. " seleção(ões) removida(s) por não existirem mais") or nil)
            end
            return changed or optionsChanged, #new
        end
        el.SetOptions = el.Refresh

        --// eventos de interface
        local function setOpen(open)
            isOpen = open
            tween(arrow, 0.15, {Rotation = open and 90 or 0})
            tween(wrapper, 0.18, {Size = UDim2.new(1, 0, 0, open and openHeight() or ROW_H)})
            if open and opts2.Source then
                el:Refresh()
            end
        end
        header.MouseButton1Click:Connect(function()
            setOpen(not isOpen)
        end)
        allBtn.MouseButton1Click:Connect(function()
            el:SelectAll(false)
        end)
        clearBtn.MouseButton1Click:Connect(function()
            el:Clear(false)
        end)
        if searchBox then
            searchBox:GetPropertyChangedSignal("Text"):Connect(function()
                local q = searchBox.Text:lower():match("^%s*(.-)%s*$")
                if q ~= query then
                    query = q
                    rebuild()
                end
            end)
        end

        -- valor inicial (Default/Selected) e padrão para "restaurar"
        local initial = opts2.Default or opts2.Selected or {}
        if type(initial) == "string" then
            initial = {initial}
        end
        local initNorm = normalize(initial)
        el.Default = copy(initNorm)
        rebuild()
        for _, v in ipairs(initNorm) do
            if #options == 0 or optionSet[v] then
                selected[v] = true
            end
        end
        lastCommitted = selectedList()
        if opts2.Source then
            table.insert(multiSources, el)
        end
        refreshVisuals()
        return finalize(el, opts2)
    end

    function SectionMT:AddDropdown(opts2)
        opts2 = opts2 or {}
        local multi = opts2.Multi == true
        local ITEM_H, GAP, MAX_VISIBLE = 30, 3, 5
        local options = {}
        for _, o in ipairs(opts2.Options or {}) do
            table.insert(options, tostring(o))
        end
        local selected = {}
        local isOpen = false
        local itemButtons = {}

        local wrapper = new("Frame", {
            BackgroundColor3 = Theme.Element,
            BorderSizePixel = 0,
            ClipsDescendants = true,
            Size = UDim2.new(1, 0, 0, ROW_H),
            LayoutOrder = self:_nextOrder(),
        }, self._frame)
        corner(wrapper, 6)

        makeLabel(wrapper, opts2.Name or "Lista", {
            Position = UDim2.fromOffset(12, 0),
            Size = UDim2.new(0.5, -12, 0, ROW_H),
            TextTruncate = Enum.TextTruncate.AtEnd,
        })
        local valueLabel = makeLabel(wrapper, "", {
            Position = UDim2.new(0.5, 0, 0, 0),
            Size = UDim2.new(0.5, -30, 0, ROW_H),
            TextXAlignment = Enum.TextXAlignment.Right,
            TextColor3 = Theme.SubText,
            TextTruncate = Enum.TextTruncate.AtEnd,
        })
        local arrow = makeLabel(wrapper, ">", {
            Position = UDim2.new(1, -24, 0, 0),
            Size = UDim2.fromOffset(16, ROW_H),
            TextXAlignment = Enum.TextXAlignment.Center,
            TextColor3 = Theme.SubText,
            Font = FONT_BOLD,
        })
        local header = new("TextButton", {
            BackgroundTransparency = 1,
            Size = UDim2.new(1, 0, 0, ROW_H),
            Text = "",
            ZIndex = 2,
        }, wrapper)
        local hv = {over = false}
        header.MouseEnter:Connect(function()
            hv.over = true
            tween(wrapper, 0.1, {BackgroundColor3 = Theme.ElementHover})
        end)
        header.MouseLeave:Connect(function()
            hv.over = false
            tween(wrapper, 0.1, {BackgroundColor3 = Theme.Element})
        end)

        local list = new("ScrollingFrame", {
            Position = UDim2.new(0, 6, 0, ROW_H + 2),
            Size = UDim2.new(1, -12, 0, 0),
            BackgroundColor3 = Theme.Background,
            BorderSizePixel = 0,
            ScrollBarThickness = 3,
            CanvasSize = UDim2.new(),
            AutomaticCanvasSize = Enum.AutomaticSize.Y,
            ScrollingDirection = Enum.ScrollingDirection.Y,
        }, wrapper)
        corner(list, 6)
        new("UIListLayout", {Padding = UDim.new(0, GAP), SortOrder = Enum.SortOrder.LayoutOrder}, list)
        padding(list, 3, 3, 3, 3)

        local function listHeight()
            local n = math.min(math.max(#options, 1), MAX_VISIBLE)
            return n * (ITEM_H + GAP) + 3
        end

        local function openHeight()
            return ROW_H + 2 + listHeight() + 6
        end

        local function currentValue()
            if multi then
                local out = {}
                for _, o in ipairs(options) do
                    if selected[o] then
                        table.insert(out, o)
                    end
                end
                return out
            end
            for _, o in ipairs(options) do
                if selected[o] then
                    return o
                end
            end
            return nil
        end

        local function valueKey(v)
            if type(v) == "table" then
                return table.concat(v, "\0")
            end
            return tostring(v)
        end

        local function displayText()
            local v = currentValue()
            if multi then
                if #v == 0 then
                    return opts2.Placeholder or "Nenhum"
                elseif #v <= 2 then
                    return table.concat(v, ", ")
                end
                return #v .. " selecionados"
            end
            return v or opts2.Placeholder or "Selecionar"
        end

        local function refreshVisuals()
            valueLabel.Text = displayText()
            for name, b in pairs(itemButtons) do
                local on = selected[name] == true
                b.TextColor3 = on and Theme.Accent or Theme.Text
                b.BackgroundColor3 = on and Theme.ElementHover or Theme.Element
            end
        end
        bindAccent(refreshVisuals)

        local el = {}
        local choose

        local function rebuild()
            for _, c in ipairs(list:GetChildren()) do
                if c:IsA("TextButton") or c:IsA("TextLabel") then
                    c:Destroy()
                end
            end
            itemButtons = {}
            if #options == 0 then
                makeLabel(list, "Sem opções", {
                    Size = UDim2.new(1, 0, 0, ITEM_H),
                    TextXAlignment = Enum.TextXAlignment.Center,
                    TextColor3 = Theme.SubText,
                    TextSize = 12,
                })
            end
            for i, name in ipairs(options) do
                local b = new("TextButton", {
                    LayoutOrder = i,
                    Size = UDim2.new(1, 0, 0, ITEM_H),
                    BackgroundColor3 = Theme.Element,
                    BorderSizePixel = 0,
                    AutoButtonColor = false,
                    Text = name,
                    Font = FONT,
                    TextSize = 13,
                    TextColor3 = Theme.Text,
                    TextTruncate = Enum.TextTruncate.AtEnd,
                }, list)
                corner(b, 5)
                itemButtons[name] = b
                b.MouseButton1Click:Connect(function()
                    choose(name)
                end)
            end
            list.Size = UDim2.new(1, -12, 0, listHeight())
            if isOpen then
                wrapper.Size = UDim2.new(1, 0, 0, openHeight())
            end
            refreshVisuals()
        end

        local function setOpen(open)
            isOpen = open
            tween(arrow, 0.15, {Rotation = open and 90 or 0})
            tween(wrapper, 0.18, {Size = UDim2.new(1, 0, 0, open and openHeight() or ROW_H)})
        end

        local function commit(silent)
            local cur = currentValue()
            refreshVisuals()
            setFlag(opts2.Flag, cur)
            if not silent then
                fire(opts2.Callback, cur)
                queueSave()
            end
        end

        choose = function(name)
            if multi then
                selected[name] = not selected[name] or nil
            else
                selected = {[name] = true}
                setOpen(false)
            end
            commit(false)
        end

        header.MouseButton1Click:Connect(function()
            setOpen(not isOpen)
        end)

        function el:Get()
            return currentValue()
        end
        function el:Serialize()
            return currentValue()
        end
        function el:Set(v, silent)
            local wanted = {}
            if multi then
                if type(v) == "table" then
                    for k, val in pairs(v) do
                        if type(k) == "number" then
                            wanted[tostring(val)] = true
                        elseif val then
                            wanted[tostring(k)] = true
                        end
                    end
                end
            elseif v ~= nil then
                wanted[tostring(v)] = true
            end
            selected = {}
            for _, o in ipairs(options) do
                if wanted[o] then
                    selected[o] = true
                end
            end
            commit(silent)
        end
        function el:Refresh(newOptions)
            local before = valueKey(currentValue())
            options = {}
            for _, o in ipairs(newOptions or {}) do
                table.insert(options, tostring(o))
            end
            local valid = {}
            for _, o in ipairs(options) do
                if selected[o] then
                    valid[o] = true
                end
            end
            selected = valid
            rebuild()
            if valueKey(currentValue()) ~= before then
                commit(false)
            end
        end

        el.Default = opts2.Default
        rebuild()
        if opts2.Default ~= nil then
            el:Set(opts2.Default, true)
        else
            refreshVisuals()
            setFlag(opts2.Flag, currentValue())
        end
        return finalize(el, opts2)
    end

    function SectionMT:AddKeybind(opts2)
        opts2 = opts2 or {}
        local key = toKeyCode(opts2.Default)
        local row = self:_row(ROW_H)
        makeLabel(row, opts2.Name or "Tecla", {
            Position = UDim2.fromOffset(12, 0),
            Size = UDim2.new(1, -120, 1, 0),
            TextTruncate = Enum.TextTruncate.AtEnd,
        })
        local btn = new("TextButton", {
            AnchorPoint = Vector2.new(1, 0.5),
            Position = UDim2.new(1, -6, 0.5, 0),
            Size = UDim2.fromOffset(96, 26),
            BackgroundColor3 = Theme.Background,
            BorderSizePixel = 0,
            AutoButtonColor = false,
            Text = "",
            Font = FONT,
            TextSize = 12,
            TextColor3 = Theme.Text,
        }, row)
        corner(btn, 5)
        local btnStroke = stroke(btn, Theme.Stroke, 1)

        local el = {Default = key}
        local function render()
            local listening = listeningKeybind == el
            if listening then
                btn.Text = "pressione..."
                btn.TextColor3 = Theme.Accent
                btnStroke.Color = Theme.Accent
            else
                btn.Text = key == Enum.KeyCode.Unknown and "Nenhuma" or key.Name
                btn.TextColor3 = Theme.Text
                btnStroke.Color = Theme.Stroke
            end
        end
        el._render = render

        function el:Get()
            return key
        end
        function el:Serialize()
            return key.Name
        end
        function el:Set(v, silent)
            key = toKeyCode(v)
            if listeningKeybind == el then
                listeningKeybind = nil
            end
            render()
            setFlag(opts2.Flag, key)
            if not silent then
                fire(opts2.Changed, key)
                queueSave()
            end
        end
        function el:_press()
            fire(opts2.Callback, key)
        end

        btn.MouseButton1Click:Connect(function()
            local prev = listeningKeybind
            listeningKeybind = nil
            if prev then
                prev._render()
            end
            if prev ~= el then
                listeningKeybind = el
                render()
            end
        end)

        table.insert(keybinds, el)
        render()
        return finalize(el, opts2)
    end

    --// ---------- Abas ----------
    function Window:SelectTab(tab)
        for _, t in ipairs(Window.Tabs) do
            t._setSelected(t == tab)
        end
    end

    -- seções flutuantes seguem o Auto-Lock: só arrastam com o menu aberto (cliques sempre funcionam)
    local floatDragOK = Main.Visible
    track(Main:GetPropertyChangedSignal("Visible"):Connect(function()
        floatDragOK = Main.Visible
    end))
    local floatCounter = 0

    function Window:AddTab(name, tabOpts)
        tabOpts = tabOpts or {}
        local Tab = {Name = name, Sections = {}}
        local index = #Window.Tabs + 1

        local btn = new("TextButton", {
            Name = "Tab_" .. tostring(name),
            Size = UDim2.new(1, 0, 0, 34),
            BackgroundColor3 = Theme.Element,
            BackgroundTransparency = 1,
            BorderSizePixel = 0,
            AutoButtonColor = false,
            Text = "",
            LayoutOrder = index,
        }, Sidebar)
        corner(btn, 6)
        local indicator = new("Frame", {
            AnchorPoint = Vector2.new(0, 0.5),
            Position = UDim2.new(0, 0, 0.5, 0),
            Size = UDim2.fromOffset(3, 16),
            BackgroundColor3 = Theme.Accent,
            BorderSizePixel = 0,
            Visible = false,
        }, btn)
        corner(indicator, 2)
        bindAccent(function()
            indicator.BackgroundColor3 = Theme.Accent
        end)
        local text = makeLabel(btn, tostring(name), {
            Position = UDim2.fromOffset(12, 0),
            Size = UDim2.new(1, -16, 1, 0),
            TextColor3 = Theme.SubText,
            TextTruncate = Enum.TextTruncate.AtEnd,
        })

        local page = new("ScrollingFrame", {
            Name = "Page_" .. tostring(name),
            Size = UDim2.fromScale(1, 1),
            BackgroundTransparency = 1,
            BorderSizePixel = 0,
            ScrollBarThickness = 3,
            ScrollBarImageColor3 = Theme.Accent,
            CanvasSize = UDim2.new(),
            AutomaticCanvasSize = Enum.AutomaticSize.Y,
            ScrollingDirection = Enum.ScrollingDirection.Y,
            Visible = false,
        }, Content)
        new("UIListLayout", {Padding = UDim.new(0, 8), SortOrder = Enum.SortOrder.LayoutOrder}, page)
        padding(page, 8, 8, 10, 8)
        Tab.Page = page
        local columns
        if tabOpts.Columns == 2 then
            local grid = new("Frame", {
                Name = "Grid", BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 0),
                AutomaticSize = Enum.AutomaticSize.Y,
            }, page)
            new("UIListLayout", {
                FillDirection = Enum.FillDirection.Horizontal, Padding = UDim.new(0, 8),
                SortOrder = Enum.SortOrder.LayoutOrder, VerticalAlignment = Enum.VerticalAlignment.Top,
            }, grid)
            columns = {}
            for i = 1, 2 do
                columns[i] = new("Frame", {
                    Name = "Col" .. i, BackgroundTransparency = 1, Size = UDim2.new(0.5, -4, 0, 0),
                    AutomaticSize = Enum.AutomaticSize.Y, LayoutOrder = i,
                }, grid)
                new("UIListLayout", {Padding = UDim.new(0, 8), SortOrder = Enum.SortOrder.LayoutOrder}, columns[i])
            end
        end
        bindAccent(function()
            page.ScrollBarImageColor3 = Theme.Accent
        end)

        Tab._setSelected = function(on)
            page.Visible = on
            indicator.Visible = on
            tween(btn, 0.15, {BackgroundTransparency = on and 0 or 1})
            tween(text, 0.15, {TextColor3 = on and Theme.Text or Theme.SubText})
        end

        btn.MouseButton1Click:Connect(function()
            Window:SelectTab(Tab)
        end)

        function Tab:AddSection(secName, startOpen)
            local collapsible = tabOpts.Collapsible ~= false
            local holder = columns and columns[(#Tab.Sections % 2) + 1] or page
            local frame = new("Frame", {
                Name = "Section_" .. tostring(secName),
                BackgroundColor3 = Theme.Surface,
                BackgroundTransparency = 0.35,
                BorderSizePixel = 0,
                Size = UDim2.new(1, 0, 0, 0),
                AutomaticSize = Enum.AutomaticSize.Y,
                LayoutOrder = #Tab.Sections + 1,
            }, holder)
            corner(frame, 10)
            stroke(frame, Theme.Stroke, 1)
            new("UIListLayout", {Padding = UDim.new(0, 6), SortOrder = Enum.SortOrder.LayoutOrder}, frame)
            padding(frame, 8, 8, 8, 8)

            local body = frame
            if collapsible then
                local open = startOpen == true
                local header = new("TextButton", {
                    Name = "Header", Size = UDim2.new(1, 0, 0, 26), BackgroundTransparency = 1,
                    AutoButtonColor = false, Font = FONT_BOLD, TextSize = 13, TextColor3 = Theme.Text,
                    TextXAlignment = Enum.TextXAlignment.Left, TextTruncate = Enum.TextTruncate.AtEnd,
                    LayoutOrder = 0, Text = "",
                }, frame)
                new("UIPadding", {PaddingRight = UDim.new(0, 40)}, header)
                local pin = new("TextButton", {
                    Name = "PinFloat", AnchorPoint = Vector2.new(1, 0.5), Position = UDim2.new(1, 36, 0.5, 0),
                    Size = UDim2.fromOffset(32, 22), BackgroundTransparency = 1, Text = "📌", TextSize = 14,
                    Font = FONT_BOLD, TextColor3 = Theme.Text, AutoButtonColor = true, ZIndex = 2,
                }, header)
                body = new("Frame", {
                    Name = "Body", BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 0),
                    AutomaticSize = Enum.AutomaticSize.Y, LayoutOrder = 1, Visible = open,
                }, frame)
                local bodyLayout = new("UIListLayout", {Padding = UDim.new(0, 6), SortOrder = Enum.SortOrder.LayoutOrder}, body)

                -- cabeçalho sem símbolo (a fonte não desenha setas): fica na cor de destaque quando aberto
                local floating = false
                local function renderHeader()
                    header.Text = floating and (tostring(secName) .. " (flutuando)") or tostring(secName)
                    header.TextColor3 = floating and Theme.SubText or (open and Theme.Accent or Theme.Text)
                end
                renderHeader()
                bindAccent(renderHeader)

                -- abre/fecha com animação (altura), depois volta ao tamanho automático
                local token, running = 0, nil
                local function finish(show)
                    body.Visible = show
                    body.ClipsDescendants = false
                    body.AutomaticSize = Enum.AutomaticSize.Y
                    body.Size = UDim2.new(1, 0, 0, 0)
                end
                -- transforma o card em janela flutuante (e volta ao menu)
                local holder, scaleConn
                local function dock()
                    if not floating then
                        return
                    end
                    floating = false
                    if scaleConn then
                        scaleConn:Disconnect()
                        scaleConn = nil
                    end
                    body.Parent = frame
                    body.LayoutOrder = 1
                    open = false
                    body.Visible = false
                    body.AutomaticSize = Enum.AutomaticSize.Y
                    body.Size = UDim2.new(1, 0, 0, 0)
                    if holder then
                        holder:Destroy()
                        holder = nil
                    end
                    renderHeader()
                end
                local function detach()
                    if floating then
                        return
                    end
                    token = token + 1
                    if running then
                        running:Cancel()
                    end
                    finish(true)
                    floating = true
                    floatCounter = floatCounter + 1
                    holder = new("Frame", {
                        Name = "RN_FloatSection", Size = UDim2.fromOffset(250, 0), AutomaticSize = Enum.AutomaticSize.Y,
                        BackgroundColor3 = Theme.Surface, BackgroundTransparency = 0.12, BorderSizePixel = 0,
                        Active = true, ZIndex = 7,
                    }, Root)
                    corner(holder, 10)
                    stroke(holder, Theme.Accent, 1.5)
                    local ui = new("UIScale", {Scale = scaleObj.Scale}, holder)
                    new("UIListLayout", {Padding = UDim.new(0, 6), SortOrder = Enum.SortOrder.LayoutOrder}, holder)
                    padding(holder, 6, 6, 6, 6)
                    local bar = new("Frame", {
                        Name = "TitleBar", Size = UDim2.new(1, 0, 0, 26), BackgroundTransparency = 1, Active = true,
                        LayoutOrder = 0,
                    }, holder)
                    makeLabel(bar, tostring(secName), {
                        Size = UDim2.new(1, -96, 1, 0), Font = FONT_BOLD, TextSize = 13, TextColor3 = Theme.Accent,
                        TextTruncate = Enum.TextTruncate.AtEnd,
                    })
                    local dockBtn = new("TextButton", {
                        AnchorPoint = Vector2.new(1, 0.5), Position = UDim2.new(1, 0, 0.5, 0), Size = UDim2.fromOffset(56, 22),
                        BackgroundColor3 = Theme.Element, Text = "Fixar", Font = FONT_BOLD, TextSize = 11,
                        TextColor3 = Theme.Text, AutoButtonColor = true,
                    }, bar)
                    corner(dockBtn, 6)
                    dockBtn.MouseButton1Click:Connect(dock)
                    local miniBtn = new("TextButton", {
                        AnchorPoint = Vector2.new(1, 0.5), Position = UDim2.new(1, -62, 0.5, 0), Size = UDim2.fromOffset(28, 22),
                        BackgroundColor3 = Theme.Element, Text = "—", Font = FONT_BOLD, TextSize = 12,
                        TextColor3 = Theme.Accent, AutoButtonColor = true,
                    }, bar)
                    corner(miniBtn, 6)
                    local collapsedFloat = false
                    miniBtn.MouseButton1Click:Connect(function()
                        collapsedFloat = not collapsedFloat
                        body.Visible = not collapsedFloat -- minimiza: fica só a barra de título
                    end)
                    body.Parent = holder
                    body.LayoutOrder = 1
                    body.Visible = true
                    scaleConn = scaleObj:GetPropertyChangedSignal("Scale"):Connect(function()
                        ui.Scale = scaleObj.Scale
                    end)
                    local vp = viewport()
                    local step = ((floatCounter - 1) % 5) * 28
                    local pos = {x = vp.X * 0.5 - 125 * scaleObj.Scale + step, y = 56 + step}
                    pos.x, pos.y = place(holder, pos.x, pos.y, Vector2.new(250 * scaleObj.Scale, 60))
                    makeDraggable(bar, holder, pos, function()
                        return holder.AbsoluteSize
                    end, nil, function()
                        return floatDragOK
                    end)
                    renderHeader()
                end
                pin.MouseButton1Click:Connect(function()
                    if floating then
                        dock()
                    else
                        detach()
                    end
                end)

                header.MouseButton1Click:Connect(function()
                    if floating then
                        dock() -- tocar no card "flutuando" traz de volta
                        return
                    end
                    open = not open
                    renderHeader()
                    token = token + 1
                    local my = token
                    if running then
                        running:Cancel()
                    end
                    local info = TweenInfo.new(0.3, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
                    if open then
                        body.AutomaticSize = Enum.AutomaticSize.None
                        body.Size = UDim2.new(1, 0, 0, 0)
                        body.ClipsDescendants = true
                        body.Visible = true
                        task.spawn(function()
                            local tries = 0
                            repeat -- espera o layout medir o conteúdo
                                task.wait()
                                tries = tries + 1
                            until bodyLayout.AbsoluteContentSize.Y > 0 or tries >= 6
                            if my ~= token then
                                return
                            end
                            local target = bodyLayout.AbsoluteContentSize.Y / math.max(scaleObj.Scale, 0.01)
                            if target <= 0 then
                                finish(true)
                                return
                            end
                            running = TweenService:Create(body, info, {Size = UDim2.new(1, 0, 0, target)})
                            running.Completed:Connect(function()
                                if my == token then
                                    finish(true)
                                end
                            end)
                            running:Play()
                        end)
                    else
                        local current = body.AbsoluteSize.Y / math.max(scaleObj.Scale, 0.01)
                        body.AutomaticSize = Enum.AutomaticSize.None
                        body.Size = UDim2.new(1, 0, 0, current)
                        body.ClipsDescendants = true
                        running = TweenService:Create(body, info, {Size = UDim2.new(1, 0, 0, 0)})
                        running.Completed:Connect(function()
                            if my == token then
                                finish(false)
                            end
                        end)
                        running:Play()
                    end
                end)
            else
                local header = makeLabel(frame, tostring(secName), {
                    Size = UDim2.new(1, 0, 0, 18),
                    Font = FONT_BOLD,
                    TextSize = 12,
                    TextColor3 = Theme.Accent,
                    LayoutOrder = 0,
                })
                bindAccent(function()
                    header.TextColor3 = Theme.Accent
                end)
            end

            local section = setmetatable({_frame = body, _page = page, _order = 0, _tabName = Tab.Name}, SectionMT)
            table.insert(Tab.Sections, section)
            return section
        end

        table.insert(Window.Tabs, Tab)
        if index == 1 then
            Window:SelectTab(Tab)
        end
        return Tab
    end

    --// ---------- Métodos da janela ----------
    function Window:SetVisible(v)
        visible = v == true
        Main.Visible = visible
        if visible then
            fitWindow()
        end
    end

    function Window:Toggle()
        Window:SetVisible(not visible)
    end

    function Window:IsAlive()
        return alive
    end

    function Window:Track(conn)
        return track(conn)
    end

    function Window:OnDestroy(fn)
        table.insert(cleanups, fn)
    end

    function Window:SetAccent(color)
        Theme.Accent = color
        for _, fn in ipairs(accentUpdaters) do
            pcall(fn)
        end
    end

    function Window:SetScale(s)
        userScale = math.clamp(tonumber(s) or 1, 0.5, 1.5)
        fitWindow()
    end

    function Window:SetTransparency(t)
        Main.BackgroundTransparency = math.clamp(tonumber(t) or 0, 0, 0.8)
    end

    function Window:SetLauncherVisible(v)
        Launcher.Visible = v == true
    end

    function Window:Save()
        return saveConfig()
    end

    function Window:ResetAll()
        for _, el in pairs(Window.Elements) do
            pcall(el.Set, el, el.Default, false)
        end
        queueSave()
    end

    function Window:ClearNotifications()
        for _, child in ipairs(notifHolder:GetChildren()) do
            if child:IsA("GuiObject") then
                child:Destroy()
            end
        end
    end

    function Window:Notify(o)
        if not alive then
            return
        end
        o = o or {}
        if Window.Flags.ui_notify == false and not o.Force then
            return
        end
        local colors = {
            info = Theme.Accent,
            success = Color3.fromRGB(74, 222, 128),
            warning = Color3.fromRGB(251, 191, 36),
            error = Color3.fromRGB(248, 113, 113),
        }
        local color = colors[o.Type or "info"] or Theme.Accent

        notifyCount = notifyCount + 1
        local card = new("CanvasGroup", {
            BackgroundColor3 = Theme.Surface,
            BorderSizePixel = 0,
            Size = UDim2.new(1, 0, 0, 0),
            AutomaticSize = Enum.AutomaticSize.Y,
            GroupTransparency = 1,
            LayoutOrder = notifyCount,
        }, notifHolder)
        corner(card, 8)
        stroke(card, Theme.Stroke, 1)
        new("Frame", {
            BackgroundColor3 = color,
            BorderSizePixel = 0,
            Size = UDim2.new(0, 3, 1, 0),
        }, card)
        local inner = new("Frame", {
            BackgroundTransparency = 1,
            Size = UDim2.new(1, 0, 0, 0),
            AutomaticSize = Enum.AutomaticSize.Y,
        }, card)
        padding(inner, 14, 8, 10, 8)
        new("UIListLayout", {Padding = UDim.new(0, 2), SortOrder = Enum.SortOrder.LayoutOrder}, inner)
        makeLabel(inner, tostring(o.Title or "Aviso"), {
            Size = UDim2.new(1, 0, 0, 16),
            Font = FONT_BOLD,
            TextTruncate = Enum.TextTruncate.AtEnd,
            LayoutOrder = 1,
        })
        if o.Content and o.Content ~= "" then
            makeLabel(inner, tostring(o.Content), {
                Size = UDim2.new(1, 0, 0, 0),
                AutomaticSize = Enum.AutomaticSize.Y,
                TextWrapped = true,
                TextSize = 12,
                TextColor3 = Theme.SubText,
                LayoutOrder = 2,
            })
        end

        local closed = false
        local function dismiss()
            if closed or not alive then
                return
            end
            closed = true
            tween(card, 0.25, {GroupTransparency = 1})
            task.delay(0.28, function()
                if card.Parent then
                    card:Destroy()
                end
            end)
        end
        local tap = new("TextButton", {
            BackgroundTransparency = 1,
            Size = UDim2.fromScale(1, 1),
            Text = "",
            ZIndex = 3,
        }, card)
        tap.MouseButton1Click:Connect(dismiss)

        tween(card, 0.2, {GroupTransparency = 0})
        task.delay(tonumber(o.Duration) or 4, dismiss)
    end

    function Window:Destroy()
        if not alive then
            return
        end
        saveConfig()
        alive = false
        for _, fn in ipairs(cleanups) do
            pcall(fn)
        end
        for _, c in ipairs(connections) do
            pcall(function()
                c:Disconnect()
            end)
        end
        connections = {}
        gui:Destroy()
        if ENV[INSTANCE_KEY] == Window then
            ENV[INSTANCE_KEY] = nil
        end
    end

    --// ---------- Entrada global (teclas) ----------
    track(UserInputService.InputBegan:Connect(function(input, processed)
        if input.UserInputType ~= Enum.UserInputType.Keyboard then
            return
        end
        if listeningKeybind then
            local kb = listeningKeybind
            listeningKeybind = nil
            if input.KeyCode == Enum.KeyCode.Escape then
                kb._render()
            else
                kb:Set(input.KeyCode, false)
            end
            return
        end
        if processed then
            return
        end
        if input.KeyCode == Window.ToggleKey and Window.ToggleKey ~= Enum.KeyCode.Unknown then
            Window:Toggle()
            return
        end
        for _, kb in ipairs(keybinds) do
            if kb:Get() == input.KeyCode and input.KeyCode ~= Enum.KeyCode.Unknown then
                kb:_press()
            end
        end
    end))

    --// ---------- Ações finais de montagem ----------
    minBtn.MouseButton1Click:Connect(function()
        minimized = not minimized
        Sidebar.Visible = not minimized
        Content.Visible = not minimized
        local sc = autoScale()
        local curH = minimized and (TOPBAR_H + 1) or fullH
        mainSize = Vector2.new(mainSize.X, curH * sc)
        tween(Main, 0.25, {Size = UDim2.fromOffset(Main.Size.X.Offset, curH)})
        mainPos.x, mainPos.y = place(Main, mainPos.x, mainPos.y, mainSize)
    end)
    local closeArmed = false
    closeBtn.MouseButton1Click:Connect(function()
        if not closeArmed then
            closeArmed = true
            closeBtn.Text = "?"
            Window:Notify({Title = "Fechar a interface?", Content = "Toque no X de novo para fechar de vez.", Duration = 2.5, Force = true})
            task.delay(2.5, function()
                closeArmed = false
                if alive then
                    closeBtn.Text = "X"
                end
            end)
            return
        end
        Window:Destroy()
    end)

    fitWindow()
    do
        local vp = viewport()
        mainPos.x, mainPos.y = place(Main, (vp.X - mainSize.X) / 2, (vp.Y - mainSize.Y) / 2, mainSize)
        launcherPos.x, launcherPos.y = place(Launcher, 12, vp.Y * 0.3, LAUNCHER_SIZE)
    end

    makeDraggable(Launcher, Launcher, launcherPos, function()
        return LAUNCHER_SIZE
    end, function()
        Window:Toggle()
    end)

    track(Root:GetPropertyChangedSignal("AbsoluteSize"):Connect(function()
        fitWindow()
        fitLauncher()
        launcherPos.x, launcherPos.y = place(Launcher, launcherPos.x, launcherPos.y, LAUNCHER_SIZE)
    end))

    -- laços compartilhados: confirmação de estado dos recursos e atualização das listas abertas
    task.spawn(function()
        local acc = 0
        while alive do
            task.wait(0.5)
            local ok, err = pcall(pollFeatures)
            if not ok then
                warn("[NovaUI] status: " .. tostring(err))
            end
            acc = acc + 0.5
            if acc >= 2 then
                acc = 0
                for _, m in ipairs(multiSources) do
                    if m:IsOpen() then
                        pcall(m.Refresh, m)
                    end
                end
            end
        end
    end)
    function Window:RefreshSources()
        for _, m in ipairs(multiSources) do
            pcall(m.Refresh, m)
        end
    end

    Window.Gui = gui
    Window.Root = Root
    Window.Main = Main
    Window.Launcher = Launcher
    Window.Saved = savedConfig
    Window._makeDraggable = makeDraggable
    Window._place = place
    Window._viewport = viewport

    ENV[INSTANCE_KEY] = Window
    return Window
end

--// ============================================================
--//  RN TEAM  -  recursos (construídos sobre a NovaUI acima)
--//  Configurações: arquivo RN_TEAM_SAVE.json (tabela ENV.RN_Data.Config)
--// ============================================================

local MenuBackgroundImageId = "107573785014146" -- fundo do MenuBackground
local FLOAT_IMAGE_ID = "133657192115931" -- FloatClick.Image (definido na biblioteca)

local Win = Nova.CreateWindow({
    Title = "RN TEAM",
    SubTitle = "Universal · Multi-Game",
    ConfigName = "RN_TEAM_SAVE",
    ToggleKey = Enum.KeyCode.RightShift,
    Accent = Color3.fromRGB(0, 200, 120),
})
local F = Win.Flags -- valores atuais de todos os controles
ENV.RN_Data = {Config = F}

local Gui, Root, MainFrame, FloatClick = Win.Gui, Win.Root, Win.Main, Win.Launcher

-- Abas, na ordem do menu (cards recolhíveis; duas colunas onde há muitos cards)
local tabCombat = Win:AddTab("⚔️ Combate", {Columns = 2})
local tabFarm = Win:AddTab("🌾 Farm", {Columns = 2})
local tabVisual = Win:AddTab("👁 Visual", {Columns = 2})
local tabMove = Win:AddTab("🏃 Movimento", {Columns = 2})
local tabMisc = Win:AddTab("🎲 Misc", {Columns = 2})
local tabExec = Win:AddTab("💻 Executor", {Collapsible = false})
local tabStatus = Win:AddTab("📊 Status", {Columns = 1})
local tabEvents = Win:AddTab("📜 Eventos", {Collapsible = false})
local tabCfg = Win:AddTab("⚙️ Config", {Columns = 1})
local createFloatButton -- definido na aba Misc (botões flutuantes)

--// ---------------- migração do save antigo (RN_TEAM_SAVE.json na raiz) ----------------
-- Só roda quando ainda não existe save novo; copia os valores antigos para as flags novas.
do
    if Win.CanSave and next(Win.Saved) == nil and type(isfile) == "function" then
        local ok, legacy = pcall(function()
            if isfile("RN_TEAM_SAVE.json") then
                return HttpService:JSONDecode(readfile("RN_TEAM_SAVE.json"))
            end
        end)
        if ok and type(legacy) == "table" then
            local S = Win.Saved
            local function put(flag, v)
                if v ~= nil then
                    S[flag] = v
                end
            end
            local function rgb(t)
                if type(t) == "table" and tonumber(t[1]) and tonumber(t[2]) and tonumber(t[3]) then
                    return string.format("%d, %d, %d", math.clamp(t[1], 0, 255), math.clamp(t[2], 0, 255), math.clamp(t[3], 0, 255))
                end
            end
            local function pct(x)
                x = tonumber(x)
                return x and math.floor(x * 100 + 0.5)
            end
            put("mv_speed", legacy.Speed)
            put("mv_jump", legacy.Jump)
            put("fly_speed", legacy.FlySpeed)
            put("spin_speed", legacy.SpinSpeed)
            put("antivoid", legacy.AntiVoid)
            put("aim_smooth", legacy.AimbotSmooth)
            put("aim_fov", legacy.AimbotFOV)
            put("aimn_fov", legacy.AimbotNPCFOV)
            put("aimn_smooth", legacy.AimbotNPCSmooth)
            put("hb_size", legacy.HitboxSize)
            put("hb_part", legacy.HitboxPart)
            put("hb_transp", pct(legacy.HitboxTransparency))
            put("hbn_size", legacy.NPCHitboxSize)
            put("hbn_transp", pct(legacy.NPCHitboxTrans))
            put("fp_off", legacy.FarmPlayerOffset)
            put("fp_mode", legacy.FarmPlayerMode)
            put("fn_off", legacy.FarmNPCOffset)
            put("fn_mode", legacy.FarmNPCMode)
            put("fn_all", legacy.FarmAllNPCs)
            put("fi_speed", legacy.FarmItemSpeed)
            put("ch_speed", legacy.TweenChaseSpeed)
            if type(legacy.FarmNPCDir) == "string" and legacy.FarmNPCDir ~= "" then
                put("fn_dir", legacy.FarmNPCDir)
                put("hbn_dir", legacy.FarmNPCDir)
                put("aimn_dir", legacy.FarmNPCDir)
            end
            put("fi_dir", legacy.FarmItemDir)
            put("espo_dir", legacy.ESPDir)
            put("ia_dir", legacy.InteractDir)
            put("spec_dir", legacy.SpectateNPCDir)
            put("chams_on", legacy.ChamsEnabled)
            put("chams_team", legacy.ChamsTeamCheck)
            put("chams_fill", rgb(legacy.ChamsColor))
            put("chams_outline", rgb(legacy.ChamsOutlineColor))
            put("chams_filltr", legacy.ChamsFillTrans)
            put("chams_outtr", legacy.ChamsOutlineTrans)
            put("accent", rgb(legacy.AccentColor))
            local modes = {
                FireClickDetector = "ClickDetector",
                FireTouchTransmitter = "Toque (TouchInterest)",
                TouchTransmitter = "Toque (TouchInterest)",
            }
            if type(legacy.InteractionMode) == "string" then
                put("ia_method", modes[legacy.InteractionMode] or legacy.InteractionMode)
            end
            if type(legacy.ScriptsDB) == "table" then
                S.exec_slots = legacy.ScriptsDB
            end
        end
    end
end

FloatClick.Image = "rbxassetid://" .. FLOAT_IMAGE_ID

--// ---------------- utilidades gerais ----------------

-- Monitoramento de execução: cada função informa o que REALMENTE rodou (usado pelo Painel de Status)
local Mon = {t = {}, detail = {}, wait = {}, err = {}, conns = {}}
function Mon.tick(id, detail, waiting) -- rodou agora (waiting = ligado, mas faltando uma condição)
    Mon.t[id] = os.clock()
    Mon.detail[id] = detail
    Mon.wait[id] = waiting or nil
end
function Mon.beat(id) -- só prova que o laço está vivo
    Mon.t[id] = os.clock()
    Mon.detail[id] = Mon.detail[id] or "ciclo em execução"
end
function Mon.fail(id, err)
    Mon.err[id] = {t = os.clock(), msg = tostring(err)}
end
function Mon.probe(id, maxAge)
    maxAge = maxAge or 2.5
    return function(control)
        local now = os.clock()
        local t = Mon.t[id]
        if control ~= true then
            if t and now - t < 0.6 then
                return "active", "encerrando..."
            end
            return "inactive"
        end
        local e = Mon.err[id]
        if e and now - e.t < 8 then
            return "error", e.msg
        end
        if t and now - t < maxAge then
            if Mon.wait[id] then
                return "waiting", Mon.detail[id]
            end
            return "active", Mon.detail[id]
        end
        return "waiting", "sem execução confirmada"
    end
end

local function notify(title, content, kind)
    kind = kind or "info"
    local level = ({success = "SUCCESS", warning = "WARNING", error = "ERROR"})[kind] or "INFO"
    Win:Log(level, tostring(title) .. ": " .. tostring(content))
    Win:Notify({Title = title, Content = content, Type = kind, Duration = 3})
end

-- ids: id (ou lista de ids) de recursos a marcar com erro quando o ciclo falhar
local function connect(signal, fn, ids)
    return Win:Track(signal:Connect(function(...)
        local ok, err = pcall(fn, ...)
        if not ok then
            warn("[RN TEAM] " .. tostring(err))
            if type(ids) == "string" then
                ids = {ids}
            end
            for _, id in ipairs(ids or {}) do
                Mon.fail(id, err)
            end
            Win:Log("ERROR", "Erro em " .. tostring(type(ids) == "table" and ids[1] or "ciclo interno"), tostring(err))
        end
    end))
end

local function getHum(ch)
    ch = ch or LocalPlayer.Character
    return ch and ch:FindFirstChildOfClass("Humanoid")
end

local function getRoot(ch)
    ch = ch or LocalPlayer.Character
    return ch and (ch:FindFirstChild("HumanoidRootPart") or ch.PrimaryPart)
end

local function isAlive(ch)
    local h = getHum(ch)
    return h ~= nil and h.Health > 0
end

local function trim(s)
    return (tostring(s or ""):match("^%s*(.-)%s*$"))
end

local function parseRGB(text)
    local r, g, b = tostring(text):match("^%s*(%d+)%s*[,;%s]%s*(%d+)%s*[,;%s]%s*(%d+)%s*$")
    r, g, b = tonumber(r), tonumber(g), tonumber(b)
    if not (r and g and b) then
        return nil
    end
    return string.format("%d, %d, %d", math.min(r, 255), math.min(g, 255), math.min(b, 255))
end

local function toColor(text, fallback)
    local n = parseRGB(text)
    if not n then
        return fallback
    end
    local r, g, b = n:match("(%d+), (%d+), (%d+)")
    return Color3.fromRGB(tonumber(r), tonumber(g), tonumber(b))
end

-- "Pasta.Sub.Pasta" ou "Workspace/Pasta"; sem prefixo, parte do Workspace.
local function resolvePath(text)
    text = trim(text)
    if text == "" then
        return nil
    end
    local parts = {}
    for p in text:gmatch("[^%./\\]+") do
        table.insert(parts, p)
    end
    local cur, start = Workspace, 1
    local first = parts[1] and parts[1]:lower()
    if first == "game" then
        cur, start = game, 2
    elseif first == "workspace" then
        start = 2
    end
    for i = start, #parts do
        local nxt = cur:FindFirstChild(parts[i])
        if not nxt and cur == game then
            local ok, svc = pcall(game.GetService, game, parts[i])
            nxt = ok and svc or nil
        end
        if not nxt then
            return nil
        end
        cur = nxt
    end
    return cur
end

local function posOf(inst)
    if not inst or not inst.Parent then
        return nil
    end
    if inst:IsA("BasePart") then
        return inst.Position
    end
    if inst:IsA("Model") then
        local ok, cf = pcall(inst.GetPivot, inst)
        if ok then
            return cf.Position
        end
    end
    local bp = inst:FindFirstChildWhichIsA("BasePart", true)
    return bp and bp.Position
end

local function isAlly(plr)
    return plr.Team ~= nil and LocalPlayer.Team ~= nil and plr.Team == LocalPlayer.Team
end

local function getPart(model, name, strict)
    local alt = {Torso = "UpperTorso", UpperTorso = "Torso", LowerTorso = "Torso"}
    local p = model:FindFirstChild(name)
    if not (p and p:IsA("BasePart")) and alt[name] then
        p = model:FindFirstChild(alt[name])
    end
    if p and p:IsA("BasePart") then
        return p
    end
    if strict then
        return nil
    end
    return model:FindFirstChild("HumanoidRootPart") or model.PrimaryPart
end

local function toSet(list)
    local s = {}
    if type(list) == "table" then
        for _, v in ipairs(list) do
            s[tostring(v)] = true
        end
    end
    return s
end

local function savedList(flag)
    local out = {}
    local v = Win.Saved[flag]
    if type(v) == "table" then
        for _, x in ipairs(v) do
            table.insert(out, tostring(x))
        end
    end
    return out
end

-- NPCs (modelos com Humanoid que não são jogadores), com cache curto
local npcCache = {}
local function getNPCs(dirText)
    local now = os.clock()
    local c = npcCache[dirText]
    if c and now - c.t < 0.5 then
        return c.list
    end
    local list = {}
    local function walk(inst, depth)
        for _, ch in ipairs(inst:GetChildren()) do
            if ch:IsA("Model") then
                if ch:FindFirstChildOfClass("Humanoid") then
                    if not Players:GetPlayerFromCharacter(ch) then
                        table.insert(list, ch)
                    end
                elseif depth < 2 then
                    walk(ch, depth + 1)
                end
            elseif ch:IsA("Folder") and depth < 2 then
                walk(ch, depth + 1)
            end
        end
    end
    local dir = resolvePath(dirText)
    if dir then
        walk(dir, 0)
    end
    npcCache[dirText] = {t = now, list = list}
    return list
end

local function npcNames(dirText)
    local seen, out = {}, {}
    for _, m in ipairs(getNPCs(dirText)) do
        if not seen[m.Name] then
            seen[m.Name] = true
            table.insert(out, m.Name)
        end
    end
    table.sort(out)
    return out
end

-- Atualiza um MultiDropdown pela sua Source; avisa quando nada foi encontrado
local function refreshMulti(dd, what)
    if not dd then
        return
    end
    local _, count = dd:Refresh()
    if count == 0 and what then
        notify("Nada encontrado", "Nenhum(a) " .. what .. " no diretório informado.", "warning")
    end
end

--// ---------------- gerenciador de loops ----------------
local Loops = {}
local function stopLoop(key)
    Loops[key] = nil
end

local function startLoop(key, fn, getInterval)
    local token = {}
    Loops[key] = token
    task.spawn(function()
        while Loops[key] == token and Win:IsAlive() do
            Mon.beat(key)
            local ok, err = pcall(fn)
            if not ok then
                warn("[RN TEAM] loop " .. tostring(key) .. ": " .. tostring(err))
                Mon.fail(key, err)
                Win:Log("ERROR", "Erro no loop '" .. tostring(key) .. "'", tostring(err))
            end
            local iv = tonumber(getInterval and getInterval()) or 0.5
            if iv <= 0 then
                task.wait() -- intervalo 0 ou negativo: roda a cada frame (sempre cede, não trava o jogo)
            else
                iv = math.min(iv, 3600)
                local waited = 0
                while waited < iv and Loops[key] == token do
                    local d = math.min(0.25, iv - waited)
                    task.wait(d)
                    waited = waited + d
                    Mon.beat(key)
                end
            end
        end
    end)
end

--// ---------------- movimentação Tween (uma por vez) ----------------
-- Durante o Tween: sem colisão (atravessa paredes) e sem gravidade; tudo é desfeito ao terminar/cancelar.
local Mover = {tween = nil, owner = nil, held = nil, bv = nil, conn = nil, touched = setmetatable({}, {__mode = "k"})}

local function moverHelpersOn(root)
    if not (Mover.bv and Mover.bv.Parent) then
        Mover.bv = new("BodyVelocity", {Velocity = Vector3.zero, MaxForce = Vector3.new(1e6, 1e6, 1e6)}, root)
    end
    if not Mover.conn then
        Mover.conn = RunService.Stepped:Connect(function()
            local ch = LocalPlayer.Character
            if ch then
                for _, p in ipairs(ch:GetDescendants()) do
                    if p:IsA("BasePart") and p.CanCollide then
                        Mover.touched[p] = true
                        p.CanCollide = false
                    end
                end
            end
        end)
    end
end

local function moverHelpersOff()
    if Mover.conn then
        Mover.conn:Disconnect()
        Mover.conn = nil
    end
    if Mover.bv then
        pcall(function()
            Mover.bv:Destroy()
        end)
        Mover.bv = nil
    end
    for p in pairs(Mover.touched) do
        if p.Parent then
            p.CanCollide = true
        end
        Mover.touched[p] = nil
    end
end

function Mover.hold(owner, root) -- reserva o movimento (noclip + sem gravidade) para um andador contínuo
    local cur = Mover.tween
    if cur and Mover.owner ~= owner and cur.PlaybackState == Enum.PlaybackState.Playing then
        return false
    end
    if Mover.held and Mover.held ~= owner then
        return false
    end
    Mover.held = owner
    moverHelpersOn(root)
    return true
end

function Mover.release(owner)
    if Mover.held == owner then
        Mover.held = nil
        if not Mover.tween then
            moverHelpersOff()
        end
    end
end

function Mover.cancel(owner)
    if owner and Mover.held == owner then
        Mover.release(owner)
    end
    if owner and Mover.owner ~= owner then
        return
    end
    if not owner then
        Mover.held = nil
    end
    if Mover.tween then
        pcall(function()
            Mover.tween:Cancel()
        end)
    end
    Mover.tween, Mover.owner = nil, nil
    moverHelpersOff()
end

function Mover.to(owner, root, pos, speed)
    local cur = Mover.tween
    if cur and Mover.owner ~= owner and cur.PlaybackState == Enum.PlaybackState.Playing then
        return nil -- outro sistema está se movendo; não iniciar movimentos simultâneos
    end
    if Mover.held and Mover.held ~= owner then
        return nil -- um andador contínuo (rota) está com o movimento
    end
    local dist = (root.Position - pos).Magnitude
    if dist <= 1 then
        Mover.cancel()
        return nil
    end
    if cur then
        pcall(function()
            cur:Cancel()
        end)
        Mover.tween = nil
    end
    local t = math.max(dist / math.max(tonumber(speed) or 100, 1), 0.03)
    local rot = root.CFrame - root.CFrame.Position
    local tw = TweenService:Create(root, TweenInfo.new(t, Enum.EasingStyle.Linear), {CFrame = CFrame.new(pos) * rot})
    Mover.tween, Mover.owner = tw, owner
    moverHelpersOn(root)
    tw.Completed:Connect(function()
        if Mover.tween == tw then
            Mover.tween, Mover.owner = nil, nil
            moverHelpersOff()
        end
    end)
    tw:Play()
    return tw
end

function Mover.playing(owner)
    return Mover.tween ~= nil and Mover.owner == owner and Mover.tween.PlaybackState == Enum.PlaybackState.Playing
end

local function teleportTo(pos)
    local root = getRoot()
    if not root then
        return false
    end
    local rot = root.CFrame - root.CFrame.Position
    root.CFrame = CFrame.new(pos) * rot
    root.AssemblyLinearVelocity = Vector3.zero
    return true
end

--// ---------------- Auto-Lock dos botões flutuantes ----------------
-- isDraggingEnabled = MainFrame.Visible (uma única conexão, nunca recriada)
local isDraggingEnabled = MainFrame.Visible
Win:Track(MainFrame:GetPropertyChangedSignal("Visible"):Connect(function()
    isDraggingEnabled = MainFrame.Visible
end))

local Overlay = new("Frame", {
    Name = "RN_Overlay",
    BackgroundTransparency = 1,
    BorderSizePixel = 0,
    Size = UDim2.fromScale(1, 1),
    ZIndex = 0,
    Active = false,
}, Root)
local ESPFolder = new("Folder", {Name = "RN_ESP"}, Gui)

--// ============================================================
--//  ABA COMBATE: Aimbots e Hitbox
--// ============================================================
local AIM_PARTS = {"Head", "HumanoidRootPart", "Torso", "UpperTorso"}
local HB_PARTS = {"HumanoidRootPart", "Head", "Torso", "UpperTorso", "LowerTorso"}

do
    local s = tabCombat:AddSection("🎯 Aimbot Jogadores")
    s:AddToggle({Name = "Aimbot", Flag = "aim_on", Default = false})
    s:AddToggle({Name = "Mostrar círculo de FOV", Flag = "aim_fov_show", Default = false, Feature = false})
    s:AddToggle({Name = "Team Check (ignorar aliados)", Flag = "aim_team", Default = true, Feature = false})
    s:AddToggle({Name = "Visible Check (sem obstáculos)", Flag = "aim_vis", Default = true, Feature = false})
    s:AddSlider({Name = "FOV", Flag = "aim_fov", Min = 10, Max = 360, Default = 50, Step = 1})
    s:AddSlider({Name = "Suavidade (1 = instantâneo)", Flag = "aim_smooth", Min = 0, Max = 1, Default = 0.8, Step = 0.05})
    s:AddDropdown({Name = "Parte do corpo", Flag = "aim_part", Options = AIM_PARTS, Default = "Head"})

    local n = tabCombat:AddSection("🎯 Aimbot NPCs")
    n:AddToggle({Name = "Aimbot NPC", Flag = "aimn_on", Default = false})
    n:AddToggle({Name = "Mostrar círculo de FOV", Flag = "aimn_fov_show", Default = false, Feature = false})
    n:AddInput({Name = "Pasta de NPCs", Flag = "aimn_dir", Default = "", Placeholder = "Ex.: Workspace.NPCs"})
    n:AddSlider({Name = "FOV", Flag = "aimn_fov", Min = 10, Max = 360, Default = 50, Step = 1})
    n:AddSlider({Name = "Suavidade (1 = instantâneo)", Flag = "aimn_smooth", Min = 0, Max = 1, Default = 0.8, Step = 0.05})
    n:AddDropdown({Name = "Parte do corpo", Flag = "aimn_part", Options = AIM_PARTS, Default = "Head"})
end

do
    -- Círculos de FOV (Frames, sem depender da Drawing API)
    local function makeCircle(name, color)
        local f = new("Frame", {
            Name = name,
            AnchorPoint = Vector2.new(0.5, 0.5),
            Position = UDim2.fromScale(0.5, 0.5),
            BackgroundTransparency = 1,
            BorderSizePixel = 0,
            Visible = false,
            ZIndex = 0,
            Active = false,
        }, Overlay)
        new("UICorner", {CornerRadius = UDim.new(1, 0)}, f)
        stroke(f, color, 1.5, 0.2)
        return f
    end
    local circP = makeCircle("FOV_Players", Color3.fromRGB(255, 255, 255))
    local circN = makeCircle("FOV_NPCs", Color3.fromRGB(255, 190, 60))

    local rayParams = RaycastParams.new()
    rayParams.FilterType = Enum.RaycastFilterType.Exclude

    local function isVisible(part, model)
        local cam = Workspace.CurrentCamera
        if not cam then
            return false
        end
        local filter = {cam}
        if LocalPlayer.Character then
            table.insert(filter, LocalPlayer.Character)
        end
        rayParams.FilterDescendantsInstances = filter
        local origin = cam.CFrame.Position
        local hit = Workspace:Raycast(origin, part.Position - origin, rayParams)
        return hit == nil or hit.Instance:IsDescendantOf(model)
    end

    local function bestTarget(models, fov, partName, needVisible)
        local cam = Workspace.CurrentCamera
        if not cam then
            return nil
        end
        local center = cam.ViewportSize / 2
        local best, bestD = nil, fov
        for _, m in ipairs(models) do
            local part = m.Parent and getPart(m, partName)
            if part then
                local sp, onScreen = cam:WorldToViewportPoint(part.Position)
                if onScreen then
                    local d = (Vector2.new(sp.X, sp.Y) - center).Magnitude
                    if d < bestD and (not needVisible or isVisible(part, m)) then
                        best, bestD = part, d
                    end
                end
            end
        end
        return best
    end

    local function aimAt(part, smooth)
        local cam = Workspace.CurrentCamera
        local goal = CFrame.lookAt(cam.CFrame.Position, part.Position)
        -- igual ao script original: o valor é a fração percorrida por frame (1 = instantâneo)
        local alpha = math.clamp(tonumber(smooth) or 0.8, 0, 1)
        cam.CFrame = cam.CFrame:Lerp(goal, math.max(alpha, 0.02))
    end

    local function step()
        local cam = Workspace.CurrentCamera
        circP.Visible = F.aim_on == true and F.aim_fov_show == true
        circN.Visible = F.aimn_on == true and F.aimn_fov_show == true
        if circP.Visible then
            circP.Size = UDim2.fromOffset((F.aim_fov or 50) * 2, (F.aim_fov or 50) * 2)
        end
        if circN.Visible then
            circN.Size = UDim2.fromOffset((F.aimn_fov or 50) * 2, (F.aimn_fov or 50) * 2)
        end
        if not cam or not isAlive(LocalPlayer.Character) then
            if F.aim_on then
                Mon.tick("aim", "aguardando personagem/câmera", true)
            end
            if F.aimn_on then
                Mon.tick("aimn", "aguardando personagem/câmera", true)
            end
            return
        end

        if F.aim_on then
            local models = {}
            for _, p in ipairs(Players:GetPlayers()) do
                if p ~= LocalPlayer and isAlive(p.Character) and not (F.aim_team and isAlly(p)) then
                    table.insert(models, p.Character)
                end
            end
            local part = bestTarget(models, F.aim_fov or 50, F.aim_part or "Head", F.aim_vis)
            if part then
                Mon.tick("aim", "mirando em " .. tostring(part.Parent and part.Parent.Name))
                aimAt(part, F.aim_smooth)
                return
            end
            Mon.tick("aim", "sem alvo dentro do FOV")
        end

        if F.aimn_on and trim(F.aimn_dir) == "" then
            Mon.tick("aimn", "informe a pasta de NPCs", true)
        end
        if F.aimn_on and trim(F.aimn_dir) ~= "" then
            local models = {}
            for _, m in ipairs(getNPCs(F.aimn_dir)) do
                if isAlive(m) then
                    table.insert(models, m)
                end
            end
            local part = bestTarget(models, F.aimn_fov or 50, F.aimn_part or "Head", false)
            if part then
                Mon.tick("aimn", "mirando em " .. tostring(part.Parent and part.Parent.Name))
                aimAt(part, F.aimn_smooth)
            else
                Mon.tick("aimn", #models == 0 and "nenhum NPC vivo na pasta" or "sem alvo dentro do FOV", #models == 0)
            end
        end
    end

    local bindName = "RN_Aim"
    RunService:BindToRenderStep(bindName, Enum.RenderPriority.Camera.Value + 1, function()
        local ok, err = pcall(step)
        if not ok then
            warn("[RN TEAM] aimbot: " .. tostring(err))
            Mon.fail("aim", err)
            Mon.fail("aimn", err)
            Win:Log("ERROR", "Erro no ciclo do Aimbot", tostring(err))
        end
    end)
    Win:OnDestroy(function()
        pcall(function()
            RunService:UnbindFromRenderStep(bindName)
        end)
    end)
end

--// ---------------- Hitbox ----------------
do
    local s = tabCombat:AddSection("💥 Hitbox Jogadores")
    s:AddToggle({Name = "Hitbox", Flag = "hb_on", Default = false})
    s:AddSlider({Name = "Tamanho", Flag = "hb_size", Min = 2, Max = 600, Default = 10, Step = 1})
    s:AddDropdown({Name = "Parte do corpo", Flag = "hb_part", Options = HB_PARTS, Default = "HumanoidRootPart"})
    s:AddSlider({Name = "Transparência", Flag = "hb_transp", Min = 0, Max = 100, Default = 50, Step = 1, Suffix = "%"})

    local n = tabCombat:AddSection("💥 Hitbox NPCs")
    n:AddToggle({Name = "Hitbox NPC", Flag = "hbn_on", Default = false})
    n:AddInput({Name = "Pasta de NPCs", Flag = "hbn_dir", Default = "", Placeholder = "Ex.: Workspace.NPCs"})
    n:AddSlider({Name = "Tamanho", Flag = "hbn_size", Min = 2, Max = 100, Default = 20, Step = 1})
    n:AddSlider({Name = "Transparência", Flag = "hbn_transp", Min = 0, Max = 100, Default = 50, Step = 1, Suffix = "%"})

    local storeP, storeN = {}, {}

    local function restorePart(part, o)
        pcall(function()
            part.Size = o.Size
            part.Transparency = o.Transparency
            part.CanCollide = o.CanCollide
            part.Massless = o.Massless
        end)
    end

    local function restoreAll(store)
        for part, o in pairs(store) do
            restorePart(part, o)
            store[part] = nil
        end
    end

    -- wanted = {[part] = true}. Restaura o que saiu da seleção e aplica o novo tamanho.
    local function sync(store, wanted, size, transp)
        for part, o in pairs(store) do
            if not wanted[part] then
                if part.Parent then
                    restorePart(part, o)
                end
                store[part] = nil
            end
        end
        local v = Vector3.new(size, size, size)
        for part in pairs(wanted) do
            if not store[part] then
                store[part] = {
                    Size = part.Size,
                    Transparency = part.Transparency,
                    CanCollide = part.CanCollide,
                    Massless = part.Massless,
                }
            end
            if part.Size ~= v then
                part.Size = v
            end
            part.Transparency = transp
            part.CanCollide = false
            part.Massless = true
        end
    end

    local acc = 0
    connect(RunService.Heartbeat, function(dt)
        acc = acc + dt
        if acc < 0.1 then
            return
        end
        acc = 0

        if F.hb_on then
            local wanted = {}
            for _, p in ipairs(Players:GetPlayers()) do
                if p ~= LocalPlayer and isAlive(p.Character) then
                    local part = getPart(p.Character, F.hb_part or "HumanoidRootPart", true)
                    if part then
                        wanted[part] = true
                    end
                end
            end
            sync(storeP, wanted, F.hb_size or 10, (F.hb_transp or 50) / 100)
            local n = 0
            for _ in pairs(storeP) do
                n = n + 1
            end
            Mon.tick("hb", n .. " parte(s) ajustada(s)", n == 0)
        elseif next(storeP) then
            restoreAll(storeP)
        end

        if F.hbn_on and trim(F.hbn_dir) ~= "" then
            local wanted = {}
            for _, m in ipairs(getNPCs(F.hbn_dir)) do
                if isAlive(m) then
                    local part = getPart(m, "HumanoidRootPart", true)
                    if part then
                        wanted[part] = true
                    end
                end
            end
            sync(storeN, wanted, F.hbn_size or 20, (F.hbn_transp or 50) / 100)
            local n = 0
            for _ in pairs(storeN) do
                n = n + 1
            end
            Mon.tick("hbn", n .. " NPC(s) ajustado(s)", n == 0)
        elseif next(storeN) then
            restoreAll(storeN)
        end
        if F.hbn_on and trim(F.hbn_dir) == "" then
            Mon.tick("hbn", "informe a pasta de NPCs", true)
        end
    end, {"hb", "hbn"})

    Win:OnDestroy(function()
        restoreAll(storeP)
        restoreAll(storeN)
    end)
end

--// ============================================================
--//  ABA VISUAL: ESP, Chams, Espectador, Ambiente
--// ============================================================

local specToggle, specLabel
do
    local s = tabVisual:AddSection("📦 ESP Jogadores")
    s:AddToggle({Name = "ESP Box", Flag = "esp_box", Default = false})
    s:AddToggle({Name = "ESP Linha (Tracer)", Flag = "esp_tracer", Default = false})
    s:AddToggle({Name = "ESP Vida", Flag = "esp_health", Default = false})
    s:AddToggle({Name = "ESP Nome", Flag = "esp_name", Default = false})
    s:AddToggle({Name = "ESP Distância", Flag = "esp_dist", Default = false})
    s:AddToggle({Name = "XRay Colorido", Flag = "esp_xray", Default = false})
    s:AddToggle({Name = "ESP Assassino (papéis)", Flag = "esp_role", Default = false})
    s:AddToggle({Name = "Team Check (ignorar aliados)", Flag = "esp_team", Default = true, Feature = false})
    s:AddLabel("Papéis: detectados pelo nome das Tools do jogador (faca/adaga/espada = assassino, arma = xerife, o resto = inocente). Só funciona em jogos que expõem isso.")

    local c = tabVisual:AddSection("Chams")
    c:AddToggle({Name = "Chams", Flag = "chams_on", Default = false})
    c:AddColorPicker({Name = "Cor principal", Flag = "chams_fill", Default = "255, 0, 0"})
    c:AddColorPicker({Name = "Cor do contorno", Flag = "chams_outline", Default = "255, 255, 255"})
    c:AddSlider({Name = "Transparência do preenchimento", Flag = "chams_filltr", Min = 0, Max = 1, Default = 0.5, Step = 0.05})
    c:AddSlider({Name = "Transparência do contorno", Flag = "chams_outtr", Min = 0, Max = 1, Default = 0, Step = 0.05})
    c:AddToggle({Name = "Team Check", Flag = "chams_team", Default = true, Feature = false})
end

--// ---------------- ESP de jogadores + Chams ----------------
do
    local entries = {}
    local roleCache = {}

    local function destroyEntry(plr)
        local e = entries[plr]
        if not e then
            return
        end
        entries[plr] = nil
        roleCache[plr] = nil
        for _, inst in ipairs({e.box, e.gui, e.xray, e.chams, e.tracer}) do
            pcall(function()
                inst:Destroy()
            end)
        end
    end

    local function newEntry()
        local e = {}
        e.box = new("SelectionBox", {LineThickness = 0.04, SurfaceTransparency = 1}, ESPFolder)
        e.xray = new("Highlight", {
            DepthMode = Enum.HighlightDepthMode.AlwaysOnTop,
            FillTransparency = 0.5,
            OutlineTransparency = 0,
        }, ESPFolder)
        e.chams = new("Highlight", {DepthMode = Enum.HighlightDepthMode.AlwaysOnTop}, ESPFolder)
        e.gui = new("BillboardGui", {
            Size = UDim2.fromOffset(130, 44),
            StudsOffset = Vector3.new(0, 3.6, 0),
            AlwaysOnTop = true,
            ResetOnSpawn = false,
            Enabled = false,
        }, ESPFolder)
        e.name = makeLabel(e.gui, "", {
            Size = UDim2.new(1, 0, 0, 15), Font = FONT_BOLD, TextSize = 13,
            TextXAlignment = Enum.TextXAlignment.Center, TextStrokeTransparency = 0.4,
        })
        e.dist = makeLabel(e.gui, "", {
            Position = UDim2.fromOffset(0, 15), Size = UDim2.new(1, 0, 0, 14), TextSize = 12,
            TextXAlignment = Enum.TextXAlignment.Center, TextStrokeTransparency = 0.4,
        })
        e.hpBack = new("Frame", {
            AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0, 33),
            Size = UDim2.fromOffset(70, 5), BackgroundColor3 = Color3.fromRGB(20, 20, 20), BorderSizePixel = 0,
        }, e.gui)
        e.hpFill = new("Frame", {Size = UDim2.fromScale(1, 1), BorderSizePixel = 0}, e.hpBack)
        e.tracer = new("Frame", {
            AnchorPoint = Vector2.new(0.5, 0.5), BorderSizePixel = 0, Visible = false, ZIndex = 0, Active = false,
        }, Overlay)
        return e
    end

    local ROLE_PATTERNS = {
        {"Assassino", Color3.fromRGB(255, 70, 70), {"knife", "faca", "blade", "dagger", "sword", "espada"}},
        {"Xerife", Color3.fromRGB(60, 140, 255), {"gun", "revolver", "pistol", "arma"}},
    }

    local function toolMatch(container, patterns)
        if not container then
            return false
        end
        for _, t in ipairs(container:GetChildren()) do
            if t:IsA("Tool") then
                local n = t.Name:lower()
                for _, pat in ipairs(patterns) do
                    if n:find(pat, 1, true) then
                        return true
                    end
                end
            end
        end
        return false
    end

    local function detectRole(plr)
        local c = roleCache[plr]
        local now = os.clock()
        if c and now - c.t < 0.5 then
            return c.name, c.color
        end
        local bp = plr:FindFirstChildOfClass("Backpack")
        local name, color
        for _, r in ipairs(ROLE_PATTERNS) do
            if toolMatch(plr.Character, r[3]) or toolMatch(bp, r[3]) then
                name, color = r[1], r[2]
                break
            end
        end
        if not name then
            name, color = "Inocente", Color3.fromRGB(60, 220, 100)
        end
        roleCache[plr] = {t = now, name = name, color = color}
        return name, color
    end

    local function setLine(frame, a, b, color)
        local d = b - a
        frame.Position = UDim2.fromOffset((a.X + b.X) / 2, (a.Y + b.Y) / 2)
        frame.Size = UDim2.fromOffset(d.Magnitude, 1.5)
        frame.Rotation = math.deg(math.atan2(d.Y, d.X))
        frame.BackgroundColor3 = color
        frame.Visible = true
    end

    local function hideEntry(e)
        e.box.Adornee = nil
        e.xray.Adornee = nil
        e.chams.Adornee = nil
        e.gui.Enabled = false
        e.tracer.Visible = false
    end

    local function update()
        for plr in pairs(entries) do
            if plr.Parent ~= Players then
                destroyEntry(plr)
            end
        end
        local espAny = F.esp_box or F.esp_tracer or F.esp_health or F.esp_name or F.esp_dist or F.esp_xray
        if not espAny and not F.chams_on then
            for _, e in pairs(entries) do
                hideEntry(e)
            end
            return
        end
        local cam = Workspace.CurrentCamera
        if not cam then
            return
        end
        local vp = cam.ViewportSize
        local camPos = cam.CFrame.Position
        local chamFill = toColor(F.chams_fill, Color3.fromRGB(255, 0, 0))
        local chamOut = toColor(F.chams_outline, Color3.new(1, 1, 1))

        local shownESP, shownChams = 0, 0
        for _, plr in ipairs(Players:GetPlayers()) do
            if plr ~= LocalPlayer then
                local ch = plr.Character
                local hum = getHum(ch)
                local root = getRoot(ch)
                local live = ch ~= nil and hum ~= nil and hum.Health > 0 and root ~= nil and ch.Parent ~= nil
                local ally = isAlly(plr)
                local e = entries[plr]
                local showESP = live and espAny and not (F.esp_team and ally)
                local showChams = live and F.chams_on and not (F.chams_team and ally)

                if showESP then
                    shownESP = shownESP + 1
                end
                if showChams then
                    shownChams = shownChams + 1
                end
                if (showESP or showChams) and not e then
                    e = newEntry()
                    entries[plr] = e
                end
                if e then
                    if not (showESP or showChams) then
                        hideEntry(e)
                    else
                        local color = plr.Team and plr.TeamColor.Color or Color3.new(1, 1, 1)
                        local roleName
                        if showESP and F.esp_role then
                            local rn, rc = detectRole(plr)
                            if rn then
                                roleName, color = rn, rc
                            end
                        end

                        e.box.Adornee = (showESP and F.esp_box) and ch or nil
                        e.box.Color3 = color
                        e.xray.Adornee = (showESP and F.esp_xray) and ch or nil
                        e.xray.FillColor = color
                        e.xray.OutlineColor = color

                        e.chams.Adornee = showChams and ch or nil
                        e.chams.FillColor = chamFill
                        e.chams.OutlineColor = chamOut
                        e.chams.FillTransparency = F.chams_filltr or 0.5
                        e.chams.OutlineTransparency = F.chams_outtr or 0

                        local wantGui = showESP and (F.esp_name or F.esp_dist or F.esp_health)
                        e.gui.Enabled = wantGui == true
                        if wantGui then
                            e.gui.Adornee = root
                            e.name.Visible = F.esp_name == true or roleName ~= nil
                            e.name.Text = (F.esp_name and plr.DisplayName or "") .. (roleName and (" [" .. roleName .. "]") or "")
                            e.name.TextColor3 = color
                            e.dist.Visible = F.esp_dist == true
                            e.dist.Text = math.floor((root.Position - camPos).Magnitude) .. "m"
                            e.hpBack.Visible = F.esp_health == true
                            if F.esp_health then
                                local pct = math.clamp(hum.Health / math.max(hum.MaxHealth, 1), 0, 1)
                                e.hpFill.Size = UDim2.fromScale(pct, 1)
                                e.hpFill.BackgroundColor3 = Color3.fromRGB(255, 60, 60):Lerp(Color3.fromRGB(70, 230, 100), pct)
                            end
                        end

                        if showESP and F.esp_tracer then
                            local sp = cam:WorldToViewportPoint(root.Position)
                            if sp.Z > 0 then
                                setLine(e.tracer, Vector2.new(vp.X / 2, vp.Y), Vector2.new(sp.X, sp.Y), color)
                            else
                                e.tracer.Visible = false
                            end
                        else
                            e.tracer.Visible = false
                        end
                    end
                end
            end
        end
    end

    local function updateWithStatus()
        update()
        local espAny = F.esp_box or F.esp_tracer or F.esp_health or F.esp_name or F.esp_dist or F.esp_xray or F.esp_role
        if espAny then
            local count = 0
            for _, e in pairs(entries) do
                if e.gui.Enabled or e.box.Adornee or e.xray.Adornee or e.tracer.Visible then
                    count = count + 1
                end
            end
            Mon.tick("esp", count .. " jogador(es) com ESP visível", count == 0)
        end
        if F.chams_on then
            local count = 0
            for _, e in pairs(entries) do
                if e.chams.Adornee then
                    count = count + 1
                end
            end
            Mon.tick("chams", count .. " jogador(es) com Chams", count == 0)
        end
    end
    connect(RunService.RenderStepped, updateWithStatus, {"esp", "chams"})
    connect(Players.PlayerRemoving, destroyEntry)
end

--// ---------------- ESP de objetos/NPCs + Espectador ----------------
do
    local s = tabVisual:AddSection("ESP Objetos e NPCs")
    s:AddInput({Name = "Diretório", Flag = "espo_dir", Default = "", Placeholder = "Ex.: Workspace.Itens"})
    s:AddToggle({Name = "ESP de objetos / itens / modelos", Flag = "espo_on", Default = false})
    s:AddColorPicker({Name = "Cor do destaque", Flag = "espo_color", Default = "80, 220, 255"})

    local objs = {}
    local function destroyObj(inst)
        local o = objs[inst]
        if o then
            objs[inst] = nil
            pcall(function()
                o.gui:Destroy()
            end)
            pcall(function()
                o.hl:Destroy()
            end)
        end
    end

    local function adorneeOf(inst)
        if inst:IsA("BasePart") then
            return inst
        end
        return inst:IsA("Model") and (inst.PrimaryPart or inst:FindFirstChildWhichIsA("BasePart", true)) or nil
    end

    local function refresh()
        local dir = F.espo_on and resolvePath(F.espo_dir) or nil
        local seen, count = {}, 0
        if dir then
            local color = toColor(F.espo_color, Color3.fromRGB(80, 220, 255))
            local camPos = Workspace.CurrentCamera and Workspace.CurrentCamera.CFrame.Position
            for _, inst in ipairs(dir:GetChildren()) do
                if (inst:IsA("Model") or inst:IsA("BasePart")) and count < 120 then
                    local ad = adorneeOf(inst)
                    if ad then
                        count = count + 1
                        seen[inst] = true
                        local o = objs[inst]
                        if not o then
                            local gui = new("BillboardGui", {
                                Size = UDim2.fromOffset(120, 28), AlwaysOnTop = true,
                                StudsOffset = Vector3.new(0, 2, 0), Adornee = ad, ResetOnSpawn = false,
                            }, ESPFolder)
                            local lbl = makeLabel(gui, "", {
                                Size = UDim2.fromScale(1, 1), TextSize = 12, Font = FONT_BOLD,
                                TextXAlignment = Enum.TextXAlignment.Center, TextStrokeTransparency = 0.4,
                            })
                            local hl
                            if count <= 30 then -- limite de Highlights simultâneos do Roblox
                                hl = new("Highlight", {
                                    Adornee = inst, FillTransparency = 0.6,
                                    DepthMode = Enum.HighlightDepthMode.AlwaysOnTop,
                                }, ESPFolder)
                            end
                            o = {gui = gui, lbl = lbl, hl = hl}
                            objs[inst] = o
                        end
                        o.gui.Adornee = ad
                        o.lbl.TextColor3 = color
                        if o.hl then
                            o.hl.FillColor = color
                            o.hl.OutlineColor = color
                        end
                        local d = camPos and math.floor((ad.Position - camPos).Magnitude) or 0
                        o.lbl.Text = inst.Name .. " [" .. d .. "m]"
                    end
                end
            end
        end
        for inst in pairs(objs) do
            if not seen[inst] or not inst.Parent then
                destroyObj(inst)
            end
        end
        if F.espo_on then
            if dir then
                Mon.tick("espo", count .. " objeto(s) destacado(s)", count == 0)
            else
                Mon.tick("espo", "diretório não encontrado", true)
            end
        end
    end

    task.spawn(function()
        while Win:IsAlive() do
            local ok, err = pcall(refresh)
            if not ok then
                warn("[RN TEAM] esp objetos: " .. tostring(err))
                Mon.fail("espo", err)
                Win:Log("ERROR", "Erro no ESP de objetos", tostring(err))
            end
            task.wait(0.5)
        end
    end)

    -- Espectador universal
    local sp = tabVisual:AddSection("🎥 Espectador Universal")
    sp:AddInput({Name = "Diretório dos NPCs", Flag = "spec_dir", Default = "", Placeholder = "Ex.: Workspace.NPCs"})
    local specIdx = 0
    local current -- Model sendo observado

    local function targets()
        local list = {}
        if F.spec_type == "NPCs" then
            local dir = trim(F.spec_dir) ~= "" and F.spec_dir or (F.espo_dir or "")
            for _, m in ipairs(getNPCs(dir)) do
                if isAlive(m) then
                    table.insert(list, m)
                end
            end
        else
            for _, p in ipairs(Players:GetPlayers()) do
                if p ~= LocalPlayer and isAlive(p.Character) then
                    table.insert(list, p.Character)
                end
            end
        end
        return list
    end

    local function labelFor(m)
        if not m then
            return "Alvo: nenhum"
        end
        local p = Players:GetPlayerFromCharacter(m)
        return "Alvo: " .. (p and p.DisplayName or m.Name)
    end

    local function stopSpectate()
        current = nil
        local cam = Workspace.CurrentCamera
        local hum = getHum()
        if cam and hum then
            cam.CameraSubject = hum
        end
        if specLabel then
            specLabel:Set(labelFor(nil))
        end
    end

    local function pick(dir)
        local list = targets()
        if #list == 0 then
            notify("Espectador", "Nenhum alvo disponível.", "warning")
            if F.spec_on and specToggle then
                specToggle:Set(false, false)
            end
            return
        end
        local idx = 0
        for i, m in ipairs(list) do
            if m == current then
                idx = i
            end
        end
        idx = ((idx - 1 + dir) % #list) + 1
        current = list[idx]
        if specLabel then
            specLabel:Set(labelFor(current))
        end
    end

    specToggle = sp:AddToggle({
        Name = "Espectar", Flag = "spec_on", Default = false,
        Callback = function(v)
            if v then
                current = nil
                pick(1)
            else
                stopSpectate()
            end
        end,
    })
    sp:AddDropdown({
        Name = "Tipo de alvo", Flag = "spec_type", Options = {"Jogadores", "NPCs"}, Default = "Jogadores",
        Callback = function()
            if F.spec_on then
                current = nil
                pick(1)
            end
        end,
    })
    specLabel = sp:AddLabel("Alvo: nenhum")
    sp:AddButton({Name = "< Alvo anterior", Callback = function()
        pick(-1)
    end})
    sp:AddButton({Name = "Próximo alvo >", Callback = function()
        pick(1)
    end})

    connect(RunService.RenderStepped, function()
        if not F.spec_on then
            return
        end
        if current and (not current.Parent or not isAlive(current)) then
            pick(1) -- alvo saiu/morreu: troca para o próximo
        end
        local cam = Workspace.CurrentCamera
        local hum = current and getHum(current)
        if cam and hum and cam.CameraSubject ~= hum then
            cam.CameraSubject = hum
        end
        if cam and hum and cam.CameraSubject == hum then
            Mon.tick("spec", labelFor(current))
        else
            Mon.tick("spec", "sem alvo para observar", true)
        end
    end, "spec")
    Win:OnDestroy(function()
        if F.spec_on then
            pcall(stopSpectate)
        end
    end)
end

--// ---------------- Ambiente ----------------
do
    local s = tabVisual:AddSection("Ambiente")
    s:AddToggle({Name = "Fullbright", Flag = "fb_on", Default = false})
    s:AddToggle({Name = "Remover neblina", Flag = "nofog", Default = false})
    s:AddToggle({Name = "Ajustar hora do dia", Flag = "light_time_on", Default = false})
    s:AddSlider({Name = "Hora", Flag = "light_time", Min = 0, Max = 24, Default = 12, Step = 0.5})
    s:AddToggle({Name = "Ajustar brilho", Flag = "light_bright_on", Default = false})
    s:AddSlider({Name = "Brilho", Flag = "light_bright", Min = 0, Max = 10, Default = 2, Step = 0.5})
    local function setTime(hour)
        Win.Elements.light_time:Set(hour, false)
        Win.Elements.light_time_on:Set(true, false)
    end
    s:AddButton({Name = "🌙 Noite", Callback = function()
        setTime(0)
    end})
    s:AddButton({Name = "☀️ Dia", Callback = function()
        setTime(14)
    end})
    s:AddButton({Name = "🌅 Entardecer", Callback = function()
        setTime(19)
    end})

    local c = tabVisual:AddSection("Câmera")
    c:AddToggle({Name = "Alterar FOV da câmera", Flag = "cam_fov_on", Default = false})
    c:AddSlider({Name = "FOV da câmera", Flag = "cam_fov", Min = 30, Max = 120, Default = 70, Step = 1})
    c:AddToggle({Name = "Zoom máximo personalizado", Flag = "zoom_on", Default = false})
    c:AddSlider({Name = "Distância máxima do zoom", Flag = "zoom_max", Min = 10, Max = 2000, Default = 400, Step = 10})
    c:AddSlider({Name = "Distância mínima do zoom", Flag = "zoom_min", Min = 0.5, Max = 100, Default = 0.5, Step = 0.5})
    c:AddButton({Name = "🔄 Resetar zoom padrão", Callback = function()
        Win.Elements.zoom_on:Set(false, false)
    end})

    local u = tabVisual:AddSection("🚫 Anti Interface")
    u:AddToggle({Name = "Fechar telas de compra / tela cheia", Flag = "antiui", Default = false})
    u:AddLabel("Fecha janelas que cobrem mais de 70% da tela (ex.: pop-ups de compra). Ao desligar, elas voltam.")

    -- Iluminação: aplica só o que está ligado e restaura o resto
    local stored = {}
    local lightProps = {"Brightness", "ClockTime", "FogEnd", "FogStart", "GlobalShadows", "Ambient", "OutdoorAmbient"}

    local function lightStep()
        local want = {}
        if F.fb_on then
            want.Brightness = 2
            want.GlobalShadows = false
            want.Ambient = Color3.fromRGB(178, 178, 178)
            want.OutdoorAmbient = Color3.fromRGB(178, 178, 178)
        end
        if F.nofog or F.fb_on then
            want.FogEnd = 1e6
            want.FogStart = 1e6 - 1
        end
        if F.light_time_on then
            want.ClockTime = F.light_time or 12
        end
        if F.light_bright_on then
            want.Brightness = F.light_bright or 2
        end
        for prop, val in pairs(want) do
            if stored[prop] == nil then
                stored[prop] = Lighting[prop]
            end
            if Lighting[prop] ~= val then
                Lighting[prop] = val
            end
        end
        local function applied(prop)
            return want[prop] == nil or Lighting[prop] == want[prop]
        end
        if F.fb_on then
            local ok = applied("Brightness") and applied("GlobalShadows") and applied("Ambient")
            Mon.tick("fb", ok and "iluminação aplicada" or "o jogo está sobrescrevendo a iluminação", not ok)
        end
        if F.nofog then
            local ok = applied("FogEnd")
            Mon.tick("nofog", ok and "neblina removida" or "o jogo está sobrescrevendo a neblina", not ok)
        end
        if F.light_time_on then
            local ok = applied("ClockTime")
            Mon.tick("ltime", ok and "hora aplicada" or "o jogo está alterando a hora", not ok)
        end
        if F.light_bright_on then
            local ok = applied("Brightness")
            Mon.tick("lbright", ok and "brilho aplicado" or "o jogo está alterando o brilho", not ok)
        end
        for _, prop in ipairs(lightProps) do
            if stored[prop] ~= nil and want[prop] == nil then
                pcall(function()
                    Lighting[prop] = stored[prop]
                end)
                stored[prop] = nil
            end
        end
    end

    -- Câmera / zoom
    local origFov, origZoomMax, origZoomMin
    local function camStep()
        local cam = Workspace.CurrentCamera
        if F.cam_fov_on and cam then
            origFov = origFov or cam.FieldOfView
            cam.FieldOfView = F.cam_fov or 70
            local ok = math.abs(cam.FieldOfView - (F.cam_fov or 70)) < 0.5
            Mon.tick("camfov", ok and ("FOV " .. tostring(F.cam_fov)) or "o jogo está alterando o FOV", not ok)
        elseif origFov and cam then
            cam.FieldOfView = origFov
            origFov = nil
        end
        if F.zoom_on then
            origZoomMax = origZoomMax or LocalPlayer.CameraMaxZoomDistance
            origZoomMin = origZoomMin or LocalPlayer.CameraMinZoomDistance
            LocalPlayer.CameraMaxZoomDistance = F.zoom_max or 400
            LocalPlayer.CameraMinZoomDistance = F.zoom_min or 0.5
            local ok = LocalPlayer.CameraMaxZoomDistance == (F.zoom_max or 400)
            Mon.tick("zoom", ok and "zoom personalizado aplicado" or "o jogo está alterando o zoom", not ok)
        elseif origZoomMax then
            LocalPlayer.CameraMaxZoomDistance = origZoomMax
            LocalPlayer.CameraMinZoomDistance = origZoomMin or 0.5
            origZoomMax, origZoomMin = nil, nil
        end
    end

    -- Anti Interface: fecha frames que cobrem >70% da tela (telas de compra) e restaura ao desligar
    local hidden = setmetatable({}, {__mode = "k"})
    local antiConn
    local function sweep(gui)
        if not gui or not gui:IsA("ScreenGui") or gui == Gui or gui.Name == ROOT_NAME then
            return
        end
        local cam = Workspace.CurrentCamera
        local vp = cam and cam.ViewportSize or Vector2.new(800, 600)
        for _, d in ipairs(gui:GetDescendants()) do
            if (d:IsA("Frame") or d:IsA("ImageLabel")) and d.Visible then
                local sz = d.AbsoluteSize
                if sz.X > vp.X * 0.7 and sz.Y > vp.Y * 0.7 then
                    hidden[d] = true
                    d.Visible = false
                end
            end
        end
    end
    local function antiUiOn()
        if antiConn then
            return
        end
        local pg = LocalPlayer:FindFirstChildOfClass("PlayerGui")
        if not pg then
            return
        end
        for _, g in ipairs(pg:GetChildren()) do
            pcall(sweep, g)
        end
        antiConn = pg.DescendantAdded:Connect(function(obj)
            task.delay(0.5, function()
                if not F.antiui then
                    return
                end
                local gui = obj:IsA("ScreenGui") and obj or obj:FindFirstAncestorWhichIsA("ScreenGui")
                pcall(sweep, gui)
            end)
        end)
    end
    local function antiUiOff()
        if antiConn then
            antiConn:Disconnect()
            antiConn = nil
        end
        for d in pairs(hidden) do
            if d.Parent then
                d.Visible = true
            end
            hidden[d] = nil
        end
    end

    local acc = 0
    connect(RunService.Heartbeat, function(dt)
        acc = acc + dt
        if acc < 0.2 then
            return
        end
        acc = 0
        lightStep()
        camStep()
        if F.antiui then
            antiUiOn()
            local n = 0
            for _ in pairs(hidden) do
                n = n + 1
            end
            Mon.tick("antiui", antiConn and (n .. " tela(s) fechada(s)") or "sem PlayerGui", antiConn == nil)
        elseif antiConn or next(hidden) then
            antiUiOff()
        end
    end, {"fb", "nofog", "ltime", "lbright", "camfov", "zoom", "antiui"})

    Win:OnDestroy(function()
        F.fb_on, F.nofog, F.light_time_on, F.light_bright_on = false, false, false, false
        F.cam_fov_on, F.zoom_on, F.antiui = false, false, false
        pcall(lightStep)
        pcall(camStep)
        pcall(antiUiOff)
    end)
end

--// ============================================================
--//  ABA FARM: jogadores, NPCs, itens (Tween) e perseguição
--// ============================================================
local MODES = {"Em Cima", "Em Baixo", "Nas Costas"}
local playerDropdowns = {} -- dropdowns de jogadores atualizados juntos

local function playerNameList()
    local out = {}
    for _, p in ipairs(Players:GetPlayers()) do
        if p ~= LocalPlayer then
            table.insert(out, p.Name)
        end
    end
    table.sort(out)
    return out
end

local function refreshPlayerDropdowns()
    local names = playerNameList()
    for _, dd in ipairs(playerDropdowns) do
        pcall(dd.Refresh, dd, names)
    end
end

-- Posição relativa ao alvo (igual ao script original): usa o valor ABSOLUTO do offset como distância.
-- Em Cima = acima do alvo, Em Baixo = abaixo, Nas Costas = atrás; sempre olhando para o alvo.
local function farmCFrame(targetRoot, mode, off)
    local d = math.max(math.abs(tonumber(off) or 5), 0.5)
    local tp = targetRoot.Position
    if mode == "Em Cima" then
        return CFrame.new(tp + Vector3.new(0, d, 0), tp)
    elseif mode == "Em Baixo" then
        return CFrame.new(tp - Vector3.new(0, d, 0), tp)
    end
    return targetRoot.CFrame * CFrame.new(0, 0, d)
end

local function applyFarmCFrame(cf)
    local root = getRoot()
    if root then
        root.CFrame = cf
        root.AssemblyLinearVelocity = Vector3.zero
        root.AssemblyAngularVelocity = Vector3.zero
    end
end

local function nearest(models, from)
    local best, bestD
    for _, m in ipairs(models) do
        local r = getRoot(m)
        if r and isAlive(m) then
            local d = (r.Position - from).Magnitude
            if not bestD or d < bestD then
                best, bestD = m, d
            end
        end
    end
    return best
end

-- ---------------- Farm Jogadores ----------------
do
    local s = tabFarm:AddSection("Farm Jogadores")
    s:AddToggle({Name = "Ativar farm", Flag = "fp_on", Default = false})
    s:AddToggle({Name = "Ignorar aliados", Flag = "fp_ally", Default = true, Feature = false})
    s:AddSlider({Name = "Offset de altura (valor absoluto)", Flag = "fp_off", Min = -20, Max = 10, Default = -5, Step = 1})
    s:AddDropdown({Name = "Posicionamento", Flag = "fp_mode", Options = MODES, Default = "Em Cima"})

    local target
    local function valid(plr)
        return plr and plr.Parent == Players and isAlive(plr.Character) and getRoot(plr.Character) ~= nil
            and not (F.fp_ally and isAlly(plr))
    end

    connect(RunService.Heartbeat, function()
        if not F.fp_on then
            target = nil
            return
        end
        local myRoot = getRoot()
        if not myRoot or not isAlive(LocalPlayer.Character) then
            Mon.tick("fp", "aguardando o personagem (respawn)", true)
            return -- respawn / sem personagem: espera
        end
        if not valid(target) then
            local models, byModel = {}, {}
            for _, p in ipairs(Players:GetPlayers()) do
                if p ~= LocalPlayer and valid(p) then
                    table.insert(models, p.Character)
                    byModel[p.Character] = p
                end
            end
            target = byModel[nearest(models, myRoot.Position)]
        end
        if valid(target) then
            applyFarmCFrame(farmCFrame(getRoot(target.Character), F.fp_mode, F.fp_off))
            Mon.tick("fp", "seguindo " .. target.Name)
        else
            Mon.tick("fp", "nenhum jogador válido no momento", true)
        end
    end, "fp")
end

-- ---------------- Farm NPCs ----------------
do
    local s = tabFarm:AddSection("Farm NPCs")
    local selSet = {}
    local dd

    s:AddToggle({Name = "Ativar farm", Flag = "fn_on", Default = false})
    s:AddInput({
        Name = "Diretório dos NPCs", Flag = "fn_dir", Default = "", Placeholder = "Ex.: Workspace.Mobs",
        Callback = function()
            refreshMulti(dd, "NPC")
        end,
    })
    s:AddToggle({Name = "Farmar TODOS da Pasta", Flag = "fn_all", Default = false, Feature = false})
    dd = s:AddMultiDropdown({
        Name = "NPCs específicos", Flag = "fn_sel",
        Source = function()
            return npcNames(F.fn_dir or "")
        end,
        Callback = function(v)
            selSet = toSet(v)
        end,
    })
    selSet = toSet(dd:Get())
    s:AddButton({Name = "Atualizar lista de NPCs", Callback = function()
        refreshMulti(dd, "NPC")
    end})
    s:AddDropdown({Name = "Posicionamento", Flag = "fn_mode", Options = MODES, Default = "Em Cima"})
    s:AddSlider({Name = "Offset de altura (valor absoluto)", Flag = "fn_off", Min = -40, Max = 100, Default = -5, Step = 1})

    task.defer(function()
        dd:Refresh()
    end)

    local target
    local function allowed(m)
        return m and m.Parent ~= nil and isAlive(m) and getRoot(m) ~= nil and (F.fn_all or selSet[m.Name] == true)
    end

    connect(RunService.Heartbeat, function()
        if not F.fn_on then
            target = nil
            return
        end
        if trim(F.fn_dir) == "" then
            target = nil
            Mon.tick("fn", "informe a pasta de NPCs", true)
            return
        end
        local myRoot = getRoot()
        if not myRoot or not isAlive(LocalPlayer.Character) then
            Mon.tick("fn", "aguardando o personagem (respawn)", true)
            return
        end
        if not allowed(target) then
            local cands = {}
            for _, m in ipairs(getNPCs(F.fn_dir)) do
                if allowed(m) then
                    table.insert(cands, m)
                end
            end
            target = nearest(cands, myRoot.Position)
        end
        if allowed(target) then
            applyFarmCFrame(farmCFrame(getRoot(target), F.fn_mode, F.fn_off))
            Mon.tick("fn", "farmando " .. target.Name)
        else
            Mon.tick("fn", "nenhum NPC válido (pasta/seleção)", true)
        end
    end, "fn")
end

-- ---------------- Farm Itens (Tween) ----------------
do
    local s = tabFarm:AddSection("Farm Itens (Tween)")
    local selSet = {}
    local dd

    local function itemNames()
        local dir = resolvePath(F.fi_dir)
        local seen, out = {}, {}
        if dir then
            for _, it in ipairs(dir:GetChildren()) do
                if (it:IsA("BasePart") or it:IsA("Model")) and not seen[it.Name] then
                    seen[it.Name] = true
                    table.insert(out, it.Name)
                end
            end
        end
        table.sort(out)
        return out
    end

    local function cycle()
        local root = getRoot()
        if not root or not isAlive(LocalPlayer.Character) then
            return
        end
        local dir = resolvePath(F.fi_dir)
        if not dir then
            Mon.tick("fi", "diretório dos itens não encontrado", true)
            return
        end
        local best, bestD
        for _, it in ipairs(dir:GetChildren()) do
            if (it:IsA("BasePart") or it:IsA("Model")) and (F.fi_all or selSet[it.Name]) then
                local p = posOf(it)
                if p then
                    local d = (p - root.Position).Magnitude
                    if not bestD or d < bestD then
                        best, bestD = it, d
                    end
                end
            end
        end
        if not best then
            Mon.tick("fi", "nenhum item encontrado", true)
            return
        end
        Mon.tick("fi", "indo até " .. best.Name)
        local tw = Mover.to("fi", root, posOf(best), F.fi_speed)
        if not tw then
            return
        end
        while F.fi_on and Mover.playing("fi") do
            if not best.Parent then -- o item sumiu: cancela e escolhe outro
                Mover.cancel("fi")
                return
            end
            task.wait(0.1)
        end
        task.wait(0.1)
    end

    s:AddToggle({
        Name = "Ativar farm de itens", Flag = "fi_on", Default = false,
        Callback = function(v)
            if v then
                startLoop("fi", cycle, function()
                    return 0.1
                end)
            else
                stopLoop("fi")
                Mover.cancel("fi")
            end
        end,
    })
    s:AddInput({
        Name = "Diretório dos itens", Flag = "fi_dir", Default = "", Placeholder = "Ex.: Workspace.Drops",
        Callback = function()
            refreshMulti(dd, "item")
        end,
    })
    s:AddToggle({Name = "Coletar Todos os Itens", Flag = "fi_all", Default = false, Feature = false})
    dd = s:AddMultiDropdown({
        Name = "Itens específicos", Flag = "fi_sel", Source = itemNames,
        Callback = function(v)
            selSet = toSet(v)
        end,
    })
    selSet = toSet(dd:Get())
    s:AddButton({Name = "Atualizar lista de itens", Callback = function()
        refreshMulti(dd, "item")
    end})
    task.defer(function()
        dd:Refresh()
    end)
    s:AddSlider({Name = "Velocidade Tween", Flag = "fi_speed", Min = 10, Max = 500, Default = 120, Step = 5})
end

-- ---------------- Perseguição Tween ----------------
do
    local s = tabFarm:AddSection("Perseguição Tween")
    local selSet = {}

    local function cycle()
        local root = getRoot()
        if not root or not isAlive(LocalPlayer.Character) then
            return
        end
        local best, bestD
        for _, p in ipairs(Players:GetPlayers()) do
            if p ~= LocalPlayer and isAlive(p.Character) and getRoot(p.Character) then
                if not (F.ch_ally and isAlly(p)) and (F.ch_focus ~= "Jogadores Selecionados" or selSet[p.Name]) then
                    local d = (getRoot(p.Character).Position - root.Position).Magnitude
                    if not bestD or d < bestD then
                        best, bestD = p, d
                    end
                end
            end
        end
        if not best then
            Mover.cancel("ch")
            Mon.tick("ch", "nenhum jogador válido", true)
            return
        end
        if bestD > 4 then
            Mover.to("ch", root, getRoot(best.Character).Position, F.ch_speed)
            Mon.tick("ch", "perseguindo " .. best.Name)
        else
            Mover.cancel("ch")
            Mon.tick("ch", "junto de " .. best.Name)
        end
    end

    s:AddToggle({
        Name = "Ativar perseguição", Flag = "ch_on", Default = false,
        Callback = function(v)
            if v then
                startLoop("ch", cycle, function()
                    return 0.25
                end)
            else
                stopLoop("ch")
                Mover.cancel("ch")
            end
        end,
    })
    s:AddSlider({Name = "Velocidade Tween", Flag = "ch_speed", Min = 10, Max = 500, Default = 100, Step = 5})
    s:AddDropdown({
        Name = "Foco", Flag = "ch_focus", Options = {"Todos os Jogadores", "Jogadores Selecionados"},
        Default = "Todos os Jogadores",
    })
    s:AddToggle({Name = "Ignorar aliados", Flag = "ch_ally", Default = true, Feature = false})
    local dd = s:AddMultiDropdown({
        Name = "Jogadores selecionados", Source = playerNameList,
        Callback = function(v)
            selSet = toSet(v)
        end,
    })
    dd:Refresh()
    table.insert(playerDropdowns, dd)
end

connect(Players.PlayerAdded, function()
    task.delay(0.2, refreshPlayerDropdowns)
end)
connect(Players.PlayerRemoving, function()
    task.delay(0.2, refreshPlayerDropdowns)
end)

Win:OnDestroy(function()
    Loops = {}
    Mover.cancel()
end)

--// ============================================================
--//  ABA MOVIMENTO
--// ============================================================

do
    local s = tabMove:AddSection("Velocidade e Pulo")
    s:AddToggle({Name = "Alterar velocidade", Flag = "mv_speed_on", Default = false})
    s:AddSlider({Name = "Velocidade", Flag = "mv_speed", Min = 16, Max = 500, Default = 16, Step = 1})
    s:AddToggle({Name = "Alterar pulo", Flag = "mv_jump_on", Default = false})
    s:AddSlider({Name = "Força do pulo", Flag = "mv_jump", Min = 50, Max = 500, Default = 50, Step = 1})

    local f = tabMove:AddSection("Voo e Gravidade")
    f:AddToggle({Name = "Voo", Flag = "fly_on", Default = false})
    f:AddToggle({Name = "Mostrar barra de Fly", Flag = "flybar_show", Default = true, Feature = false})
    f:AddSlider({Name = "Velocidade de voo", Flag = "fly_speed", Min = 1, Max = 1000, Default = 60, Step = 1})
    f:AddLabel("Celular: use os botões SOBE / DESCE que aparecem na tela com o voo ligado. PC: Espaço sobe, Shift/Ctrl desce.")
    f:AddToggle({Name = "AntiVoid (voltar ao último ponto seguro)", Flag = "antivoid", Default = false})
    f:AddToggle({Name = "Alterar gravidade do mapa", Flag = "grav_on", Default = false})
    f:AddSlider({Name = "Gravidade", Flag = "grav", Min = 0, Max = 196, Default = 196, Step = 1})

    local p = tabMove:AddSection("Poderes especiais")
    p:AddToggle({Name = "Noclip", Flag = "noclip", Default = false})
    p:AddToggle({Name = "Infinite Jump", Flag = "infjump", Default = false})
    p:AddToggle({Name = "Bunny Hop", Flag = "bhop", Default = false})
    p:AddToggle({Name = "Spin", Flag = "spin_on", Default = false})
    p:AddSlider({Name = "Velocidade do spin", Flag = "spin_speed", Min = 1, Max = 1000, Default = 5, Step = 1})
    p:AddToggle({Name = "AntiKnockback", Flag = "antikb", Default = false})
end

do
    -- Valores originais guardados por Humanoid (respawn cria outro Humanoid, sem vazamento)
    local orig = setmetatable({}, {__mode = "k"})
    local function origOf(hum)
        local o = orig[hum]
        if not o then
            o = {}
            orig[hum] = o
        end
        return o
    end

    local function speedJump(hum)
        local o = origOf(hum)
        if F.mv_speed_on then
            o.WalkSpeed = o.WalkSpeed or hum.WalkSpeed
            if hum.WalkSpeed ~= F.mv_speed then
                hum.WalkSpeed = F.mv_speed
            end
            local ok = hum.WalkSpeed == F.mv_speed
            Mon.tick("speed", ok and ("WalkSpeed = " .. F.mv_speed) or "o jogo está sobrescrevendo a velocidade", not ok)
        elseif o.WalkSpeed then
            hum.WalkSpeed = o.WalkSpeed
            o.WalkSpeed = nil
        end
        if F.mv_jump_on then
            if o.UseJumpPower == nil then
                o.UseJumpPower, o.JumpPower = hum.UseJumpPower, hum.JumpPower
            end
            hum.UseJumpPower = true
            if hum.JumpPower ~= F.mv_jump then
                hum.JumpPower = F.mv_jump
            end
            local ok = hum.JumpPower == F.mv_jump
            Mon.tick("jump", ok and ("JumpPower = " .. F.mv_jump) or "o jogo está sobrescrevendo o pulo", not ok)
        elseif o.UseJumpPower ~= nil then
            hum.JumpPower = o.JumpPower
            hum.UseJumpPower = o.UseJumpPower
            o.UseJumpPower, o.JumpPower = nil, nil
        end
    end

    -- Noclip
    local noclipChanged = setmetatable({}, {__mode = "k"})
    local function noclipStep(ch)
        if F.noclip then
            for _, part in ipairs(ch:GetDescendants()) do
                if part:IsA("BasePart") and part.CanCollide then
                    noclipChanged[part] = true
                    part.CanCollide = false
                end
            end
            Mon.tick("noclip", "colisão do personagem desativada")
        elseif next(noclipChanged) then
            for part in pairs(noclipChanged) do
                if part.Parent then
                    part.CanCollide = true
                end
                noclipChanged[part] = nil
            end
        end
    end

    -- Voo
    local fly = {bv = nil, bg = nil, root = nil, up = false, down = false}
    local flyUi = new("Frame", {
        Name = "RN_FlyControls", BackgroundTransparency = 1, Size = UDim2.fromOffset(60, 130),
        AnchorPoint = Vector2.new(1, 1), Position = UDim2.new(1, -16, 1, -150), Visible = false, ZIndex = 4,
    }, Root)
    local function flyButton(text, y, key)
        local b = new("TextButton", {
            Size = UDim2.fromOffset(60, 60), Position = UDim2.fromOffset(0, y), BackgroundColor3 = Theme.Surface,
            BackgroundTransparency = 0.2, Text = text, Font = FONT_BOLD, TextSize = 12, TextColor3 = Theme.Text,
            AutoButtonColor = true, ZIndex = 4,
        }, flyUi)
        corner(b, 30)
        stroke(b, Theme.Accent, 1.5)
        b.InputBegan:Connect(function(i)
            if i.UserInputType == Enum.UserInputType.Touch or i.UserInputType == Enum.UserInputType.MouseButton1 then
                fly[key] = true
            end
        end)
        b.InputEnded:Connect(function(i)
            if i.UserInputType == Enum.UserInputType.Touch or i.UserInputType == Enum.UserInputType.MouseButton1 then
                fly[key] = false
            end
        end)
    end
    flyButton("SOBE", 0, "up")
    flyButton("DESCE", 70, "down")

    local function flyCleanup(hum)
        for _, k in ipairs({"bv", "bg"}) do
            if fly[k] then
                pcall(function()
                    fly[k]:Destroy()
                end)
                fly[k] = nil
            end
        end
        fly.root = nil
        fly.up, fly.down = false, false
        flyUi.Visible = false
        if hum and hum.Parent then
            hum.PlatformStand = false
        end
    end

    local function flyStep(hum, root)
        if not F.fly_on then
            if fly.bv or fly.bg then
                flyCleanup(hum)
            end
            return
        end
        flyUi.Visible = UserInputService.TouchEnabled
        if fly.root ~= root or not (fly.bv and fly.bv.Parent) then -- (re)cria após respawn
            flyCleanup(nil)
            fly.root = root
            fly.bv = new("BodyVelocity", {MaxForce = Vector3.new(1e6, 1e6, 1e6), Velocity = Vector3.zero}, root)
            fly.bg = new("BodyGyro", {MaxTorque = Vector3.new(1e6, 1e6, 1e6), P = 9e4}, root)
            flyUi.Visible = UserInputService.TouchEnabled
        end
        local cam = Workspace.CurrentCamera
        local speed = F.fly_speed or 60
        local look = cam.CFrame.LookVector
        local move = hum.MoveDirection
        local vel = move * speed
        local flat = Vector3.new(look.X, 0, look.Z)
        flat = flat.Magnitude > 1e-3 and flat.Unit or Vector3.new(0, 0, -1)
        local forward = move:Dot(flat)
        vel = vel + Vector3.new(0, look.Y * forward * speed, 0)
        local vert = 0
        if fly.up or UserInputService:IsKeyDown(Enum.KeyCode.Space) then
            vert = vert + 1
        end
        if fly.down or UserInputService:IsKeyDown(Enum.KeyCode.LeftControl) or UserInputService:IsKeyDown(Enum.KeyCode.LeftShift) then
            vert = vert - 1
        end
        fly.bv.Velocity = vel + Vector3.new(0, vert * speed, 0)
        fly.bg.CFrame = CFrame.new(root.Position, root.Position + flat)
        hum.PlatformStand = false
        Mon.tick("fly", "voando a " .. speed .. " studs/s")
    end


    -- Barra de Fly (canto superior direito): liga/desliga o voo e ajusta a velocidade
    local vp0 = Win._viewport()
    local flyBar = new("Frame", {
        Name = "RN_FlyBar", Size = UDim2.fromOffset(268, 46), BackgroundColor3 = Theme.Surface,
        BackgroundTransparency = 0.15, BorderSizePixel = 0, Active = true, ZIndex = 6,
    }, Root)
    corner(flyBar, 10)
    stroke(flyBar, Theme.Accent, 2)
    local flyBtn = new("TextButton", {
        Position = UDim2.fromOffset(7, 7), Size = UDim2.fromOffset(96, 32), BackgroundColor3 = Theme.Element,
        AutoButtonColor = false, Text = "FLY: OFF", Font = FONT_BOLD, TextSize = 12, TextColor3 = Theme.Text, ZIndex = 7,
    }, flyBar)
    corner(flyBtn, 7)
    local speedBox = new("TextBox", {
        Position = UDim2.fromOffset(109, 7), Size = UDim2.fromOffset(90, 32), BackgroundColor3 = Theme.Background,
        Text = "60", ClearTextOnFocus = false, Font = FONT, TextSize = 13, TextColor3 = Theme.Text, ZIndex = 7,
    }, flyBar)
    corner(speedBox, 7)
    local hideBtn = new("TextButton", {
        Position = UDim2.fromOffset(205, 7), Size = UDim2.fromOffset(56, 32), BackgroundColor3 = Color3.fromRGB(150, 50, 60),
        Text = "X", Font = FONT_BOLD, TextSize = 13, TextColor3 = Color3.new(1, 1, 1), ZIndex = 7,
    }, flyBar)
    corner(hideBtn, 7)

    flyBtn.MouseButton1Click:Connect(function()
        local el = Win.Elements.fly_on
        if el then
            el:Set(not F.fly_on, false)
        end
    end)
    speedBox.FocusLost:Connect(function()
        local n = tonumber(speedBox.Text)
        local el = Win.Elements.fly_speed
        if n and el then
            el:Set(math.clamp(n, 1, 1000), false)
        end
        speedBox.Text = tostring(F.fly_speed or 60)
    end)
    hideBtn.MouseButton1Click:Connect(function()
        local el = Win.Elements.flybar_show
        if el then
            el:Set(false, false)
        end
    end)
    local barPos = {x = vp0.X - 268 - 16, y = 12}
    barPos.x, barPos.y = Win._place(flyBar, barPos.x, barPos.y, Vector2.new(268, 46))
    Win._makeDraggable(flyBar, flyBar, barPos, function()
        return flyBar.AbsoluteSize
    end, nil, function()
        return isDraggingEnabled -- Auto-Lock
    end)
    connect(RunService.Heartbeat, function()
        flyBar.Visible = F.flybar_show ~= false
        local txt = F.fly_on and "FLY: ON" or "FLY: OFF"
        if flyBtn.Text ~= txt then
            flyBtn.Text = txt
            flyBtn.BackgroundColor3 = F.fly_on and Theme.Accent or Theme.Element
        end
        if not speedBox:IsFocused() and speedBox.Text ~= tostring(F.fly_speed or 60) then
            speedBox.Text = tostring(F.fly_speed or 60)
        end
    end)

    -- AntiVoid
    local lastSafe
    local function antiVoidStep(hum, root)
        if not F.antivoid then
            lastSafe = nil
            return
        end
        local fh = Workspace.FallenPartsDestroyHeight
        if fh ~= fh or fh == -math.huge then
            fh = -500
        end
        if root.Position.Y > fh + 60 then
            if hum.FloorMaterial ~= Enum.Material.Air then
                lastSafe = root.Position + Vector3.new(0, 3, 0)
            end
            Mon.tick("antivoid", lastSafe and "ponto seguro registrado" or "aguardando chão firme para registrar um ponto seguro", lastSafe == nil)
        elseif lastSafe then
            teleportTo(lastSafe)
            Mon.tick("antivoid", "resgatado do vazio")
        end
    end

    -- Spin / Bunny Hop / AntiKnockback
    local spinAuto = setmetatable({}, {__mode = "k"})
    local function powersStep(hum, root, dt)
        if F.spin_on then
            if spinAuto[hum] == nil then
                spinAuto[hum] = hum.AutoRotate
            end
            hum.AutoRotate = false
            root.CFrame = root.CFrame * CFrame.Angles(0, math.rad((F.spin_speed or 5) * dt * 60), 0)
            Mon.tick("spin", "girando")
        elseif spinAuto[hum] ~= nil then
            hum.AutoRotate = spinAuto[hum]
            spinAuto[hum] = nil
        end

        if F.bhop then
            if hum.FloorMaterial ~= Enum.Material.Air and hum.MoveDirection.Magnitude > 0 then
                hum.Jump = true
                Mon.tick("bhop", "pulando em sequência")
            else
                Mon.tick("bhop", "aguardando movimento no chão", true)
            end
        end

        if F.antikb then
            Mon.tick("antikb", "monitorando empurrões")
        end
        if F.antikb and not F.fly_on and not Mover.tween then
            local state = hum:GetState()
            if state == Enum.HumanoidStateType.FallingDown or state == Enum.HumanoidStateType.Ragdoll then
                hum:ChangeState(Enum.HumanoidStateType.GettingUp)
            end
            local v = root.AssemblyLinearVelocity
            local flat = Vector3.new(v.X, 0, v.Z)
            local limit = math.max(hum.WalkSpeed, 16) + 30
            if flat.Magnitude > limit and hum.MoveDirection.Magnitude < 0.1 then
                root.AssemblyLinearVelocity = Vector3.new(0, v.Y, 0)
            end
        end
    end

    Mon.conns.infjump = connect(UserInputService.JumpRequest, function()
        if F.infjump then
            local hum = getHum()
            if hum then
                hum:ChangeState(Enum.HumanoidStateType.Jumping)
            end
        end
    end)

    local origGravity
    connect(RunService.Heartbeat, function(dt)
        if F.grav_on then
            origGravity = origGravity or Workspace.Gravity
            if Workspace.Gravity ~= F.grav then
                Workspace.Gravity = F.grav
            end
            local ok = Workspace.Gravity == F.grav
            Mon.tick("grav", ok and ("gravidade " .. F.grav) or "o jogo está sobrescrevendo a gravidade", not ok)
        elseif origGravity then
            Workspace.Gravity = origGravity
            origGravity = nil
        end

        local ch = LocalPlayer.Character
        local hum, root = getHum(ch), getRoot(ch)
        if not (ch and hum and root) then
            local wanting = {speed = "mv_speed_on", jump = "mv_jump_on", fly = "fly_on", antivoid = "antivoid",
                noclip = "noclip", bhop = "bhop", spin = "spin_on", antikb = "antikb"}
            for id, flag in pairs(wanting) do
                if F[flag] then
                    Mon.tick(id, "aguardando o personagem (respawn)", true)
                end
            end
            return -- sem personagem (respawn): espera
        end
        speedJump(hum)
        noclipStep(ch)
        if hum.Health > 0 then
            flyStep(hum, root)
            antiVoidStep(hum, root)
            powersStep(hum, root, dt)
        end
    end, {"speed", "jump", "fly", "antivoid", "noclip", "bhop", "spin", "antikb", "grav"})

    Win:OnDestroy(function()
        F.mv_speed_on, F.mv_jump_on, F.noclip, F.spin_on, F.fly_on = false, false, false, false, false
        if origGravity then
            Workspace.Gravity = origGravity
        end
        local hum = getHum()
        if hum then
            pcall(speedJump, hum)
            pcall(function()
                if spinAuto[hum] ~= nil then
                    hum.AutoRotate = spinAuto[hum]
                end
            end)
        end
        pcall(noclipStep, LocalPlayer.Character or Workspace)
        pcall(flyCleanup, hum)
    end)
end

--// ============================================================
--//  ABA MISC: interação automática, teleportes, informações, botões de ação
--// ============================================================
local Actions = {} -- ações reutilizadas pelos botões flutuantes

do
    local s = tabMisc:AddSection("🔌 Interação Automática")
    local selSet = {}
    local dd
    local tpIndex = 0

    local function objectList(onlySelected)
        local dir = resolvePath(F.ia_dir)
        local out = {}
        if dir then
            for _, o in ipairs(dir:GetChildren()) do
                local isRemote = o:IsA("RemoteEvent") or o:IsA("RemoteFunction")
                if (o:IsA("Model") or o:IsA("BasePart") or isRemote) and (isRemote or posOf(o)) then
                    if not onlySelected or selSet[o.Name] then
                        table.insert(out, o)
                    end
                end
            end
        end
        return out
    end

    local function objectNames()
        local seen, out = {}, {}
        for _, o in ipairs(objectList(false)) do
            if not seen[o.Name] then
                seen[o.Name] = true
                table.insert(out, o.Name)
            end
        end
        table.sort(out)
        return out
    end

    local warned = {}
    local function unsupported(what)
        if not warned[what] then
            warned[what] = true
            notify("Não suportado", "Seu executor não oferece " .. what .. ".", "warning")
        end
        return false
    end

    -- Interage conforme o método escolhido; retorna true se executou algo
    local function interact(obj)
        local method = F.ia_method or "ProximityPrompt"
        if method == "ProximityPrompt" then
            local pp = obj:IsA("ProximityPrompt") and obj or obj:FindFirstChildWhichIsA("ProximityPrompt", true)
            if not pp then
                return false
            end
            if type(fireproximityprompt) == "function" then
                fireproximityprompt(pp)
            else
                pp:InputHoldBegin()
                task.wait(math.max(pp.HoldDuration, 0) + 0.05)
                pp:InputHoldEnd()
            end
            return true
        elseif method == "ClickDetector" then
            local cd = obj:IsA("ClickDetector") and obj or obj:FindFirstChildWhichIsA("ClickDetector", true)
            if not cd then
                return false
            end
            if type(fireclickdetector) ~= "function" then
                return unsupported("fireclickdetector")
            end
            fireclickdetector(cd)
            return true
        elseif method == "RemoteEvent (FireServer)" then
            local r = obj:IsA("RemoteEvent") and obj or obj:FindFirstChildWhichIsA("RemoteEvent", true)
            if not r then
                return false
            end
            r:FireServer()
            return true
        elseif method == "RemoteFunction (InvokeServer)" then
            local r = obj:IsA("RemoteFunction") and obj or obj:FindFirstChildWhichIsA("RemoteFunction", true)
            if not r then
                return false
            end
            task.spawn(pcall, r.InvokeServer, r) -- não trava o loop se o servidor demorar
            return true
        else -- Toque
            local part = obj:IsA("BasePart") and obj or obj:FindFirstChildWhichIsA("BasePart", true)
            local root = getRoot()
            if not part or not root then
                return false
            end
            if type(firetouchinterest) ~= "function" then
                return unsupported("firetouchinterest")
            end
            firetouchinterest(root, part, 0)
            firetouchinterest(root, part, 1)
            return true
        end
    end

    function Actions.collectOnce()
        local root = getRoot()
        if not root or not isAlive(LocalPlayer.Character) then
            Mon.tick("ia_collect", "aguardando o personagem", true)
            return
        end
        if tostring(F.ia_method):find("Toque", 1, true) and type(firetouchinterest) == "function" then
            local dir = resolvePath(F.ia_dir)
            local n = 0
            if dir then
                for _, d in ipairs(dir:GetDescendants()) do
                    if d:IsA("BasePart") then
                        n = n + 1
                        if n > 300 then
                            break
                        end
                        firetouchinterest(root, d, 0)
                        firetouchinterest(root, d, 1)
                    end
                end
            end
            Mon.tick("ia_collect", dir and (n .. " peça(s) tocada(s)") or "diretório não encontrado", dir == nil)
            return
        end
        local home = root.CFrame
        local list = objectList(false)
        for i = 1, math.min(#list, 60) do
            local o = list[i]
            local p = posOf(o)
            if p and getRoot() then
                teleportTo(p + Vector3.new(0, 2, 0))
                interact(o)
                task.wait(0.08)
            end
        end
        if getRoot() then
            getRoot().CFrame = home
        end
        Mon.tick("ia_collect", #list == 0 and "nenhum objeto encontrado" or (math.min(#list, 60) .. " objeto(s) visitado(s)"), #list == 0)
    end

    function Actions.tpOnce()
        local list = objectList(true)
        if #list == 0 then
            Mon.tick("ia_tp", "nenhum objeto selecionado", true)
            return
        end
        tpIndex = (tpIndex % #list) + 1
        local p = posOf(list[tpIndex])
        if p and teleportTo(p + Vector3.new(0, 3, 0)) then
            Mon.tick("ia_tp", "teleportado para " .. list[tpIndex].Name)
        end
    end

    function Actions.interactOnce()
        local list = objectList(next(selSet) ~= nil)
        local done = 0
        for i = 1, math.min(#list, 60) do
            if interact(list[i]) then
                done = done + 1
            end
        end
        Mon.tick("ia_interact", #list == 0 and "nenhum objeto encontrado" or (done .. " de " .. #list .. " objeto(s) interagido(s)"), #list == 0)
    end

    local function interval()
        return F.ia_interval
    end

    -- Card 1: só a interação (ClickDetector, ProximityPrompt, Toque, Remotes)
    s:AddInput({
        Name = "Diretório dos objetos", Flag = "ia_dir", Default = "", Placeholder = "Ex.: Workspace.Coletaveis",
        Callback = function()
            refreshMulti(dd, "objeto")
        end,
    })
    s:AddDropdown({
        Name = "Método de interação", Flag = "ia_method",
        Options = {"ProximityPrompt", "ClickDetector", "Toque (TouchInterest)", "RemoteEvent (FireServer)", "RemoteFunction (InvokeServer)"},
        Default = "ProximityPrompt",
    })
    dd = s:AddMultiDropdown({
        Name = "Objetos selecionados", Flag = "ia_sel", Source = objectNames,
        Callback = function(v)
            selSet = toSet(v)
        end,
    })
    selSet = toSet(dd:Get())
    s:AddButton({Name = "Atualizar lista de objetos", Callback = function()
        refreshMulti(dd, "objeto")
    end})
    s:AddButton({Name = "Interagir com objetos", Callback = function()
        task.spawn(Actions.interactOnce)
    end})

    local function loopToggle(sec, name, flag, key, fn)
        sec:AddToggle({
            Name = name, Flag = flag, Default = false,
            Callback = function(v)
                if v then
                    startLoop(key, fn, interval)
                else
                    stopLoop(key)
                end
            end,
        })
    end
    loopToggle(s, "Loop de interação", "ia_loop_interact", "ia_interact", Actions.interactOnce)
    s:AddInput({Name = "Intervalo dos loops (s)", Flag = "ia_interval", Default = 0.5, Numeric = true, Min = -1, Max = 3600})

    -- Card 2: coleta de itens
    local c = tabMisc:AddSection("🧺 Coleta de Itens")
    c:AddLabel("Usa o diretório e o método do card Interação Automática.")
    c:AddButton({Name = "Coletar itens do diretório", Callback = function()
        task.spawn(Actions.collectOnce)
    end})
    loopToggle(c, "Loop de coleta", "ia_loop_collect", "ia_collect", Actions.collectOnce)

    -- Card 3: teleporte para os objetos selecionados
    local t = tabMisc:AddSection("🎯 Teleporte p/ Objetos")
    t:AddLabel("Vai para os objetos marcados em Objetos selecionados.")
    t:AddButton({Name = "Teleportar p/ objeto selecionado", Callback = Actions.tpOnce})
    loopToggle(t, "Loop de teleporte", "ia_loop_tp", "ia_tp", Actions.tpOnce)

    task.defer(function()
        dd:Refresh()
    end)
end

do
    function Actions.jump()
        local h = getHum()
        if h then
            h.Jump = true
        end
    end

    function Actions.tpNearestPlayer()
        local root = getRoot()
        local models = {}
        for _, p in ipairs(Players:GetPlayers()) do
            if p ~= LocalPlayer and isAlive(p.Character) then
                table.insert(models, p.Character)
            end
        end
        local m = root and nearest(models, root.Position)
        local r = m and getRoot(m)
        if r then
            teleportTo(r.Position + Vector3.new(0, 3, 0))
        end
    end

    local s = tabMisc:AddSection("📍 Teleportes")
    local tpPlayerDd = s:AddDropdown({Name = "Jogador", Options = playerNameList()})
    table.insert(playerDropdowns, tpPlayerDd)
    s:AddButton({Name = "Teleportar ao jogador", Callback = function()
        local name = tpPlayerDd:Get()
        local p = name and Players:FindFirstChild(name)
        local r = p and getRoot(p.Character)
        if r then
            teleportTo(r.Position + Vector3.new(0, 3, 0))
        else
            notify("Teleporte", "Jogador sem personagem no momento.", "warning")
        end
    end})

    local sps = tabMisc:AddSection("🏁 Spawns do Mapa")
    local spawnMap = {}
    local spawnDd = sps:AddDropdown({Name = "Spawn do mapa", Options = {}})
    local function refreshSpawns()
        spawnMap = {}
        local names = {}
        for _, d in ipairs(Workspace:GetDescendants()) do
            if d:IsA("SpawnLocation") then
                local n = d.Name .. " #" .. (#names + 1)
                spawnMap[n] = d
                table.insert(names, n)
            end
        end
        if #names == 0 then
            notify("Spawns", "Nenhum SpawnLocation encontrado neste jogo.", "warning")
        else
            spawnDd:Refresh(names)
        end
    end
    sps:AddButton({Name = "Buscar spawns", Callback = refreshSpawns})
    sps:AddButton({Name = "Teleportar ao spawn selecionado", Callback = function()
        local sp = spawnMap[spawnDd:Get() or ""]
        if sp and sp.Parent then
            teleportTo(sp.Position + Vector3.new(0, 4, 0))
        end
    end})

    local ps = tabMisc:AddSection("🧭 Posições e Caminho")
    -- Caminho direto: aceita sufixo :GetChildren()[N]
    local directBox = ps:AddInput({Name = "Caminho direto", Default = "", Placeholder = "Workspace.Pasta:GetChildren()[2]"})
    ps:AddButton({Name = "Teleportar ao caminho direto", Callback = function()
        local path = trim(directBox:Get())
        local idx = path:match(":GetChildren%(%)%[(%d+)%]")
        if idx then
            path = (path:gsub(":GetChildren%(%)%[%d+%]", ""))
        end
        local obj = resolvePath(path)
        if obj and idx then
            obj = obj:GetChildren()[tonumber(idx)]
        end
        local p = obj and posOf(obj)
        if p and teleportTo(p + Vector3.new(0, 3, 0)) then
            return
        end
        notify("Teleporte", "Caminho não encontrado ou sem posição.", "warning")
    end})

    local saved
    ps:AddButton({Name = "Salvar minha posição (cria botão Voltar TP)", Callback = function()
        local r = getRoot()
        if r then
            local here = r.CFrame
            saved = here
            createFloatButton(function()
                local r2 = getRoot()
                if r2 then
                    r2.CFrame = here
                end
            end, "Voltar TP")
            notify("Posição", "Posição salva e botão flutuante criado.", "success")
        end
    end})
    ps:AddButton({Name = "Voltar à posição salva", Callback = function()
        local r = getRoot()
        if r and saved then
            r.CFrame = saved
        end
    end})

    local info = tabMisc:AddSection("ℹ️ Informações do Jogador")
    local lbl = info:AddLabel("Carregando...")
    local function infoText()
        local ch = LocalPlayer.Character
        local hum, root = getHum(ch), getRoot(ch)
        local lines = {
            "Nome: " .. LocalPlayer.Name .. " (" .. LocalPlayer.DisplayName .. ")",
            "UserId: " .. LocalPlayer.UserId,
            "Idade da conta: " .. LocalPlayer.AccountAge .. " dias",
            "Personagem: " .. (ch and ch.Name or "nenhum"),
            "Vida: " .. (hum and (math.floor(hum.Health) .. "/" .. math.floor(hum.MaxHealth)) or "-"),
            "Time: " .. (LocalPlayer.Team and LocalPlayer.Team.Name or "nenhum"),
            "Posição: " .. (root and string.format("%.0f, %.0f, %.0f", root.Position.X, root.Position.Y, root.Position.Z) or "-"),
            "PlaceId: " .. game.PlaceId,
            "Jogadores: " .. #Players:GetPlayers(),
        }
        return table.concat(lines, "\n")
    end
    task.spawn(function()
        while Win:IsAlive() do
            if MainFrame.Visible then
                pcall(function()
                    lbl:Set(infoText())
                end)
            end
            task.wait(1)
        end
    end)
    info:AddButton({Name = "Reentrar no servidor", Callback = function()
        local ok = pcall(function()
            if #Players:GetPlayers() <= 1 then
                TeleportService:Teleport(game.PlaceId, LocalPlayer)
            else
                TeleportService:TeleportToPlaceInstance(game.PlaceId, game.JobId, LocalPlayer)
            end
        end)
        if not ok then
            notify("Reentrar", "Não foi possível reentrar agora.", "error")
        end
    end})
    info:AddButton({Name = "Copiar posição", Callback = function()
        local r = getRoot()
        if r and type(setclipboard) == "function" then
            local p = r.Position
            setclipboard(string.format("%.2f, %.2f, %.2f", p.X, p.Y, p.Z))
            notify("Copiado", "Posição copiada.", "success")
        else
            notify("Copiar", "Sem personagem ou sem suporte a clipboard.", "warning")
        end
    end})
    local function copyText(text, what)
        if type(setclipboard) == "function" then
            if pcall(setclipboard, tostring(text)) then
                notify("Copiado", what .. " copiado.", "success")
            else
                notify("Copiar", "Falha ao copiar " .. what .. ".", "error")
            end
        else
            notify("Copiar", "Seu executor não suporta clipboard.", "warning")
        end
    end
    info:AddButton({Name = "Copiar UserID", Callback = function()
        copyText(LocalPlayer.UserId, "UserID")
    end})
    info:AddButton({Name = "Copiar nome", Callback = function()
        copyText(LocalPlayer.Name, "Nome")
    end})
    info:AddButton({Name = "Copiar PlaceID", Callback = function()
        copyText(game.PlaceId, "PlaceID")
    end})
    info:AddButton({Name = "Resetar personagem", Callback = function()
        local h = getHum()
        if h then
            h.Health = 0
        end
    end})
    info:AddButton({Name = "Copiar JobId", Callback = function()
        if type(setclipboard) == "function" then
            setclipboard(tostring(game.JobId))
            notify("Copiado", "JobId copiado.", "success")
        else
            notify("Copiar", "Seu executor não suporta clipboard.", "warning")
        end
    end})
end

--// ---------------- Botões flutuantes de ação ----------------
do
    local MAX_FLOATS = 10
    local floats = {} -- [id] = {card = Frame}
    local counter = 0

    local actionNames = {
        "Coletar itens do diretório", "Teleportar p/ objeto selecionado", "Interagir com objetos",
        "Pular", "Teleportar p/ jogador mais próximo",
    }
    local actionFns = {
        ["Coletar itens do diretório"] = function()
            Actions.collectOnce()
        end,
        ["Teleportar p/ objeto selecionado"] = function()
            Actions.tpOnce()
        end,
        ["Interagir com objetos"] = function()
            Actions.interactOnce()
        end,
        ["Pular"] = function()
            Actions.jump()
        end,
        ["Teleportar p/ jogador mais próximo"] = function()
            Actions.tpNearestPlayer()
        end,
    }

    local function countFloats()
        local n = 0
        for _ in pairs(floats) do
            n = n + 1
        end
        return n
    end

    function createFloatButton(fn, label)
        if type(fn) ~= "function" then
            return
        end
        if countFloats() >= MAX_FLOATS then
            notify("Botões de ação", "Limite de " .. MAX_FLOATS .. " botões atingido.", "warning")
            return
        end
        counter = counter + 1
        local id = counter
        local loopKey = "float_" .. id
        local interval = 0.5

        -- nome padrão "Flutuante N" (menor número livre) quando não foi dado um nome
        local used = {}
        for _, f in pairs(floats) do
            used[f.num] = true
        end
        local num = 1
        while used[num] do
            num = num + 1
        end
        label = (label and label ~= "") and label or ("Flutuante " .. num)

        local card = new("Frame", {
            Name = "RN_ActionButton_" .. id, Size = UDim2.fromOffset(190, 46), BackgroundColor3 = Theme.Surface,
            BorderSizePixel = 0, Active = true, ZIndex = 6,
        }, Root)
        corner(card, 10)
        stroke(card, Theme.Accent, 1.5)

        local main = new("TextButton", {
            Name = "Main", Position = UDim2.fromOffset(6, 7), Size = UDim2.fromOffset(110, 32), BackgroundColor3 = Theme.Element,
            AutoButtonColor = false, Text = label, Font = FONT_BOLD, TextSize = 12, TextColor3 = Theme.Text,
            TextTruncate = Enum.TextTruncate.AtEnd, ZIndex = 7,
        }, card)
        corner(main, 8)
        local cfg = new("TextButton", {
            Name = "Config", Position = UDim2.fromOffset(122, 7), Size = UDim2.fromOffset(28, 32), BackgroundColor3 = Theme.Element,
            Text = "⚙️", Font = FONT_BOLD, TextSize = 14, TextColor3 = Theme.Text, ZIndex = 7,
        }, card)
        corner(cfg, 8)
        local close = new("TextButton", {
            Name = "Close", Position = UDim2.fromOffset(156, 7), Size = UDim2.fromOffset(28, 32), BackgroundColor3 = Color3.fromRGB(150, 50, 60),
            Text = "X", Font = FONT_BOLD, TextSize = 13, TextColor3 = Color3.new(1, 1, 1), ZIndex = 7,
        }, card)
        corner(close, 8)

        -- painel de configuração (LOOP + intervalo)
        local panel = new("Frame", {
            Name = "Settings", Position = UDim2.fromOffset(6, 46), Size = UDim2.fromOffset(178, 34),
            BackgroundTransparency = 1, Visible = false, ZIndex = 7,
        }, card)
        local loopBtn = new("TextButton", {
            Name = "Loop", Size = UDim2.fromOffset(80, 28), Position = UDim2.fromOffset(0, 3), BackgroundColor3 = Theme.Off,
            Text = "LOOP: OFF", Font = FONT_BOLD, TextSize = 11, TextColor3 = Theme.Text, ZIndex = 8,
        }, panel)
        corner(loopBtn, 6)
        local box = new("TextBox", {
            Name = "Interval", Position = UDim2.fromOffset(88, 3), Size = UDim2.fromOffset(62, 28), BackgroundColor3 = Theme.Background,
            Text = tostring(interval), ClearTextOnFocus = false, Font = FONT, TextSize = 12, TextColor3 = Theme.Text, ZIndex = 8,
        }, panel)
        corner(box, 6)
        makeLabel(panel, "s", {Position = UDim2.fromOffset(154, 3), Size = UDim2.fromOffset(20, 28), ZIndex = 8, TextColor3 = Theme.SubText})

        local function run()
            task.spawn(function()
                local ok, err = pcall(fn)
                if not ok then
                    warn("[RN TEAM] ação: " .. tostring(err))
                end
            end)
        end

        local looping = false
        local function setLoop(on)
            looping = on
            loopBtn.Text = on and "LOOP: ON" or "LOOP: OFF"
            loopBtn.BackgroundColor3 = on and Theme.Accent or Theme.Off
            if on then
                startLoop(loopKey, fn, function()
                    return interval
                end)
            else
                stopLoop(loopKey)
            end
        end
        loopBtn.MouseButton1Click:Connect(function()
            setLoop(not looping)
        end)
        box.FocusLost:Connect(function()
            local n = tonumber(box.Text)
            if n then
                interval = math.min(n, 3600) -- 0 ou negativo (ex.: -1) = a cada frame
            end
            box.Text = tostring(interval) -- valor inválido volta ao anterior
        end)
        cfg.MouseButton1Click:Connect(function()
            panel.Visible = not panel.Visible
            card.Size = panel.Visible and UDim2.fromOffset(190, 84) or UDim2.fromOffset(190, 46)
        end)
        close.MouseButton1Click:Connect(function()
            stopLoop(loopKey)
            floats[id] = nil
            card:Destroy()
        end)

        -- arraste com Auto-Lock: o toque no botão principal executa; arrastar só move com o menu aberto
        -- sempre aparece no canto de cima, no mesmo lugar (um novo fica por cima do anterior)
        local pos = {x = Win._viewport().X * 0.38, y = 8}
        pos.x, pos.y = Win._place(card, pos.x, pos.y, Vector2.new(190, 46))
        Win._makeDraggable(main, card, pos, function()
            return card.AbsoluteSize
        end, run, function()
            return isDraggingEnabled
        end)
        floats[id] = {card = card, loopKey = loopKey, num = num}
    end

    Win:RegisterFeature({
        Id = "floatbtn", Name = "Botões de ação flutuantes", Group = tabMisc.Name,
        Probe = function()
            local n = countFloats()
            if n > 0 then
                return "active", n .. " botão(ões) na tela"
            end
            return "inactive"
        end,
    })
    local s = tabMisc:AddSection("📌 Botões de Ação Flutuantes")
    local pickDd = s:AddDropdown({Name = "Ação", Options = actionNames, Default = actionNames[1]})
    local nameInput = s:AddInput({Name = "Nome do botão (opcional)", Default = "", Placeholder = "Padrão: Flutuante 1, 2, 3..."})
    s:AddButton({Name = "Criar botão flutuante (máx. 10)", Callback = function()
        local action = pickDd:Get()
        if action then
            local label = trim(nameInput:Get())
            createFloatButton(actionFns[action], label ~= "" and label or nil)
        end
    end})
    s:AddButton({Name = "Remover todos os botões", Callback = function()
        for id, f in pairs(floats) do
            stopLoop(f.loopKey)
            pcall(function()
                f.card:Destroy()
            end)
            floats[id] = nil
        end
    end})
    s:AddLabel("Com o menu fechado os botões ficam travados (só clicam). Abra o menu para reposicioná-los.")
end

--// ============================================================
--//  ABA EXECUTOR: editor com 10 slots
--// ============================================================
do
    local SLOT_COUNT = 10
    local slots = {}
    local saved = Win.Saved.exec_slots
    for i = 1, SLOT_COUNT do
        slots[i] = (type(saved) == "table" and type(saved[i]) == "string") and saved[i] or ""
    end
    -- registra no sistema de salvamento (RN_TEAM_SAVE.json); ResetAll não apaga os scripts
    Win.Elements.exec_slots = {
        Get = function()
            return slots
        end,
        Serialize = function()
            return slots
        end,
        Set = function() end,
        Default = nil,
    }

    local page = tabExec.Page
    page.ScrollingEnabled = false
    local col = new("Frame", {
        BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y,
    }, page)
    new("UIListLayout", {Padding = UDim.new(0, 6), SortOrder = Enum.SortOrder.LayoutOrder}, col)

    local order = 0
    local function row(h)
        order = order + 1
        local r = new("Frame", {BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, h), LayoutOrder = order}, col)
        new("UIListLayout", {
            FillDirection = Enum.FillDirection.Horizontal, Padding = UDim.new(0, 6),
            SortOrder = Enum.SortOrder.LayoutOrder, VerticalAlignment = Enum.VerticalAlignment.Center,
        }, r)
        return r
    end
    local function button(parent, text, n, color, callback)
        local b = new("TextButton", {
            Size = UDim2.new(1 / n, -(6 * (n - 1)) / n, 1, 0), BackgroundColor3 = Theme.Element, BackgroundTransparency = 0.2,
            AutoButtonColor = true, Text = text, Font = FONT_BOLD, TextSize = 12, TextColor3 = color or Theme.Text,
            TextTruncate = Enum.TextTruncate.AtEnd,
        }, parent)
        corner(b, 8)
        b.MouseButton1Click:Connect(callback)
        return b
    end

    local cur = 1
    local nav = row(34)
    local prevBtn = button(nav, "< Anterior", 3, nil, function() end)
    local slotLabel = makeLabel(nav, "", {
        Size = UDim2.new(1 / 3, -4, 1, 0), TextXAlignment = Enum.TextXAlignment.Center, Font = FONT_BOLD,
        TextColor3 = Theme.Accent, LayoutOrder = 2,
    })
    prevBtn.LayoutOrder = 1
    local nextBtn = button(nav, "Próximo >", 3, nil, function() end)
    nextBtn.LayoutOrder = 3

    order = order + 1
    local holder = new("ScrollingFrame", {
        Name = "EditorHolder", Size = UDim2.new(1, 0, 0, 200), LayoutOrder = order, BackgroundColor3 = Theme.Background,
        BackgroundTransparency = 0.1, BorderSizePixel = 0, ScrollBarThickness = 4, CanvasSize = UDim2.new(0, 0, 0, 0),
        AutomaticCanvasSize = Enum.AutomaticSize.Y, ClipsDescendants = true,
    }, col)
    corner(holder, 8)
    local editor = new("TextBox", {
        Name = "Editor", Size = UDim2.new(1, -8, 0, 200), AutomaticSize = Enum.AutomaticSize.Y, BackgroundTransparency = 1,
        MultiLine = true, ClearTextOnFocus = false, TextWrapped = true, Font = Enum.Font.Code, TextSize = 13,
        TextColor3 = Theme.Text, PlaceholderText = "-- Digite seu script Luau aqui...", PlaceholderColor3 = Theme.SubText,
        TextXAlignment = Enum.TextXAlignment.Left, TextYAlignment = Enum.TextYAlignment.Top, Text = "",
    }, holder)
    padding(editor, 6, 6, 6, 6)

    local function loadSlot(i)
        cur = ((i - 1) % SLOT_COUNT) + 1
        editor.Text = slots[cur]
        slotLabel.Text = "— Slot " .. cur .. " / " .. SLOT_COUNT .. " —"
    end
    prevBtn.MouseButton1Click:Connect(function()
        loadSlot(cur - 1)
    end)
    nextBtn.MouseButton1Click:Connect(function()
        loadSlot(cur + 1)
    end)

    local function runCode(code)
        if trim(code) == "" then
            notify("Executor", "Digite um código primeiro.", "warning")
            return
        end
        if type(loadstring) ~= "function" then
            notify("Executor", "loadstring não está disponível neste ambiente.", "error")
            return
        end
        local fn, err = loadstring(code)
        if not fn then
            notify("Erro de sintaxe", tostring(err), "error")
            return
        end
        notify("Executor", "Executando o script do slot " .. cur .. "...", "info")
        task.spawn(function() -- assíncrono: um script longo não trava o menu
            local ok, runErr = pcall(fn)
            if ok then
                notify("Executor", "O script terminou sem erros.", "success")
            else
                notify("Erro ao executar", tostring(runErr), "error")
            end
        end)
    end

    local r1 = row(36)
    button(r1, "Executar", 3, Color3.fromRGB(74, 222, 128), function()
        runCode(editor.Text)
    end)
    button(r1, "🗑 Limpar", 3, Color3.fromRGB(248, 113, 113), function()
        editor.Text = ""
        slots[cur] = ""
        Win:Save()
    end)
    button(r1, "📌 Botão Flutuante", 3, Theme.Accent, function()
        local code = editor.Text
        if trim(code) == "" then
            notify("Botão flutuante", "Escreva um script antes de criar o botão.", "warning")
            return
        end
        createFloatButton(function()
            runCode(code)
        end, "Script " .. cur)
    end)

    local r2 = row(36)
    button(r2, "💾 Salvar no Slot", 2, nil, function()
        slots[cur] = editor.Text
        if Win:Save() then
            notify("Executor", "Slot " .. cur .. " salvo no arquivo.", "success")
        else
            notify("Executor", "Slot " .. cur .. " mantido só na memória (não foi possível gravar o arquivo).", "warning")
        end
    end)
    button(r2, "📋 Executar Clipboard", 2, nil, function()
        if type(getclipboard) ~= "function" then
            notify("Executor", "Seu executor não oferece getclipboard.", "warning")
            return
        end
        local ok, text = pcall(getclipboard)
        if ok and type(text) == "string" and text ~= "" then
            editor.Text = text
            runCode(text)
        else
            notify("Executor", "Não foi possível ler a área de transferência.", "error")
        end
    end)

    -- O editor ocupa todo o espaço que sobra na aba (medido em unidades da UI, independente da escala)
    local FIXED = 34 + 36 + 36 + 3 * 6
    local function fit()
        local ratio = MainFrame.Size.Y.Offset > 0 and MainFrame.AbsoluteSize.Y / MainFrame.Size.Y.Offset or 1
        if ratio <= 0 then
            return
        end
        local avail = page.AbsoluteSize.Y / ratio - 20
        local h = math.max(avail - FIXED, 110)
        holder.Size = UDim2.new(1, 0, 0, h)
        editor.Size = UDim2.new(1, -8, 0, h)
    end
    page:GetPropertyChangedSignal("AbsoluteSize"):Connect(fit)
    MainFrame:GetPropertyChangedSignal("AbsoluteSize"):Connect(fit)
    fit()

    loadSlot(1)
end

--// ============================================================
--//  ABA CONFIG: fundo do menu, salvamento, interface
--// ============================================================

do
    local MenuBackground = new("ImageLabel", {
        Name = "MenuBackground", BackgroundTransparency = 1, BorderSizePixel = 0, Size = UDim2.fromScale(1, 1),
        ScaleType = Enum.ScaleType.Crop, ImageTransparency = 0.3, ZIndex = 0, Visible = false,
    }, MainFrame)
    corner(MenuBackground, 12)

    -- aceita só dígitos (ou "rbxassetid://dígitos"); vazio remove o fundo
    local function normalizeId(raw)
        raw = trim(raw)
        if raw == "" then
            return ""
        end
        local digits = raw:gsub("^rbxassetid://", "")
        if digits:match("^%d+$") then
            return digits
        end
        return nil
    end

    local function applyBackground(id)
        if not id or id == "" then
            MenuBackground.Image = ""
            MenuBackground.Visible = false
            return
        end
        MenuBackground.Image = "rbxassetid://" .. id
        MenuBackground.Visible = true
    end

    local s = tabCfg:AddSection("Imagem de fundo do menu")
    local bgInput = s:AddInput({
        Name = "ID da imagem", Flag = "bg_id", Default = MenuBackgroundImageId, Placeholder = "Somente números",
        Validate = normalizeId, CallOnInit = true,
        Callback = function(v)
            applyBackground(v)
        end,
    })
    s:AddButton({Name = "Aplicar / atualizar fundo", Callback = function()
        applyBackground(bgInput:Get())
    end})
    s:AddButton({Name = "Remover fundo", Callback = function()
        bgInput:Set("", false)
    end})

    local g = tabCfg:AddSection("🖼️ Imagens Prontas")
    local options = {}
    for i = 1, 10 do
        table.insert(options, "Imagem " .. i)
        g:AddInput({
            Name = "Imagem " .. i, Flag = "img_" .. i, Default = i == 1 and "12548072405" or "",
            Placeholder = "ID vazio", Validate = normalizeId,
        })
    end
    local pick = g:AddDropdown({Name = "Escolher imagem", Flag = "img_pick", Options = options, Default = "Imagem 1"})
    g:AddButton({Name = "Usar imagem escolhida", Callback = function()
        local n = tonumber((pick:Get() or ""):match("%d+"))
        local id = n and F["img_" .. n] or ""
        if id == "" then
            notify("Imagens prontas", "Essa entrada está vazia; nada foi carregado.", "warning")
            return
        end
        bgInput:Set(id, false)
    end})
end

do
    local s = tabCfg:AddSection("Salvamento")
    s:AddLabel(Win.CanSave
        and "Salvamento automático ativo (arquivo RN_TEAM_SAVE.json, na pasta NovaUI)."
        or "Seu ambiente não suporta arquivos: as configurações ficam só em memória nesta sessão.")
    s:AddButton({Name = "Salvar agora", Callback = function()
        notify("Configuração", Win:Save() and "Configurações salvas." or "Não foi possível salvar.", Win.CanSave and "success" or "warning")
    end})
    s:AddButton({Name = "Restaurar padrões", Callback = function()
        Win:ResetAll()
        notify("Configuração", "Valores padrão restaurados.", "info")
    end})

    local ui = tabCfg:AddSection("Interface")
    ui:AddColorPicker({
        Name = "🎨 Cor de destaque do menu", Flag = "accent", Default = "0, 200, 120", CallOnInit = true,
        Callback = function(rgb)
            Win:SetAccent(toColor(rgb, Color3.fromRGB(0, 200, 120)))
        end,
    })
    ui:AddToggle({Name = "Animação de abertura", Flag = "intro_on", Default = true, Feature = false})
    ui:AddToggle({
        Name = "Notificações", Flag = "ui_notify", Default = true, Feature = false,
        Callback = function(on)
            if not on then
                Win:ClearNotifications() -- some as que já estão na tela
            end
        end,
    })
    ui:AddSlider({
        Name = "Escala da interface", Flag = "ui_scale", Min = 0.5, Max = 1.5, Default = 1, Step = 0.05,
        Callback = function(v)
            Win:SetScale(v)
        end,
    })
    ui:AddButton({Name = "Destruir interface", Callback = function()
        Win:Destroy()
    end})
end

--// ---------------- Músicas (Config) ----------------
do
    local sec = tabCfg:AddSection("🎵 Músicas")
    local supported = type(getcustomasset) == "function" and type(writefile) == "function"
        and type(listfiles) == "function" and type(isfile) == "function"
        and type(isfolder) == "function" and type(makefolder) == "function"
    if not supported then
        sec:AddLabel("⚠️ Seu executor não oferece getcustomasset / writefile / listfiles: sem suporte a áudio.")
    else
        local FOLDER = "RN_TEAM_AUDIO"
        pcall(function()
            if not isfolder(FOLDER) then
                makefolder(FOLDER)
            end
        end)
        local SoundService = game:GetService("SoundService")
        local sound = SoundService:FindFirstChild("RN_LocalMusic")
        if not (sound and sound:IsA("Sound")) then
            sound = new("Sound", {Name = "RN_LocalMusic", Looped = true, Volume = 0.8}, SoundService)
        end
        Win:OnDestroy(function()
            pcall(function()
                sound:Stop()
                sound:Destroy()
            end)
        end)

        local PRESETS = {
            {"_Aura_Feel_Powerful", "https://files.catbox.moe/grsqkw.mp3"},
            {"_Young_Girl_A_Funk", "https://files.catbox.moe/rsekvz.mp3"},
            {"badda_td_-_picture_i_paint", "https://files.catbox.moe/zymclp.mp3"},
            {"PAYCHECK-Broken-Glass", "https://files.catbox.moe/kzghdy.mp3"},
            {"いきものがかり", "https://files.catbox.moe/dmwqsb.mp3"},
            {"Pra-Longe-Daqui-Steven-Universo", "https://files.catbox.moe/0vn6gv.mp3"},
            {"attack on titan", "https://files.catbox.moe/9g04w2.mp3"},
            {"dan Dan dan", "https://files.catbox.moe/c4bjc2.mp3"},
            {"INSANE-A-Hazbin-Hotel", "https://files.catbox.moe/oqwxkw.mp3"},
            {"Conto-do-Pescador", "https://files.catbox.moe/mzwii5.mp3"},
            {"Sexta-Feira", "https://files.catbox.moe/so49so.mp3"},
        }
        local presetByName, presetNames = {}, {}
        for _, p in ipairs(PRESETS) do
            presetByName[p[1]] = p[2]
            table.insert(presetNames, p[1])
        end

        local function safeName(name)
            return (tostring(name):gsub('[\\/:*?"<>|]', "_"))
        end
        local function fileOf(name)
            return FOLDER .. "/" .. safeName(name) .. ".mp3"
        end
        local function playFile(path)
            local ok, asset = pcall(getcustomasset, path)
            if not (ok and asset) then
                notify("Música", "Não foi possível carregar o arquivo.", "error")
                return false
            end
            sound:Stop()
            sound.SoundId = asset
            sound.TimePosition = 0
            sound:Play()
            return true
        end
        local function download(url, name, onDone)
            if not tostring(url):match("^https?://") then
                notify("Música", "Informe um link http(s) válido.", "warning")
                return
            end
            task.spawn(function()
                local ok, body = pcall(function()
                    return game:HttpGet(url)
                end)
                if not (ok and type(body) == "string" and #body > 0) then
                    notify("Música", "Falha ao baixar.", "error")
                    return
                end
                local path = fileOf(name)
                if not pcall(writefile, path, body) then
                    notify("Música", "Não foi possível salvar o arquivo.", "error")
                    return
                end
                if onDone then
                    onDone(path)
                end
            end)
        end

        local files, fileByName = {}, {}
        Win:RegisterFeature({
            Id = "music", Name = "Música", Group = tabCfg.Name,
            Probe = function()
                if sound.IsPlaying then
                    return "active", "tocando"
                end
                return "inactive"
            end,
        })
        local songDd
        local function scan()
            files, fileByName = {}, {}
            local ok, list = pcall(listfiles, FOLDER)
            if ok and type(list) == "table" then
                for _, path in ipairs(list) do
                    local low = path:lower()
                    if low:sub(-4) == ".mp3" or low:sub(-4) == ".ogg" then
                        local n = path:match("[^/\\]+$") or path
                        fileByName[n] = path
                        table.insert(files, n)
                    end
                end
                table.sort(files)
            end
            if songDd and #files > 0 then
                songDd:Refresh(files)
            end
        end

        songDd = sec:AddDropdown({
            Name = "Músicas baixadas", Options = {},
            Callback = function(name)
                local path = name and fileByName[name]
                if path then
                    playFile(path)
                end
            end,
        })
        sec:AddButton({Name = "🔄 Atualizar lista", Callback = scan})
        sec:AddButton({Name = "Play / Pause", Callback = function()
            if sound.IsPlaying then
                sound:Pause()
            elseif sound.SoundId ~= "" then
                sound:Resume()
            else
                notify("Música", "Escolha uma música primeiro.", "info")
            end
        end})
        sec:AddSlider({
            Name = "Volume", Flag = "music_vol", Min = 0, Max = 1, Default = 0.8, Step = 0.05,
            CallOnInit = true,
            Callback = function(v)
                sound.Volume = v
            end,
        })
        local linkBox = sec:AddInput({Name = "Link MP3", Default = "", Placeholder = "https://...mp3"})
        sec:AddButton({Name = "📥 Baixar e tocar", Callback = function()
            local url = trim(linkBox:Get())
            local name = "Musica_" .. os.time()
            download(url, name, function(path)
                scan()
                playFile(path)
            end)
        end})

        local pre = tabCfg:AddSection("🎶 Músicas Prontas")
        local presetDd = pre:AddDropdown({Name = "Música", Options = presetNames, Default = presetNames[1]})
        pre:AddButton({Name = "Tocar música pronta", Callback = function()
            local name = presetDd:Get()
            local url = name and presetByName[name]
            if not url then
                return
            end
            local path = fileOf(name)
            if isfile(path) then
                playFile(path) -- já baixada: toca direto
            else
                notify("Música", "Baixando " .. name .. "...", "info")
                download(url, name, function(p)
                    scan()
                    playFile(p)
                end)
            end
        end})
        pre:AddLabel("A música é baixada só na primeira vez; depois toca direto do arquivo.")

        scan()
    end
end

--// ---------------- Atalhos de teclado ----------------
-- RightShift: abre/fecha o menu (da biblioteca) | End: mostra/esconde o FloatClick | Delete: fecha a interface
connect(UserInputService.InputBegan, function(input, processed)
    if processed or input.UserInputType ~= Enum.UserInputType.Keyboard then
        return
    end
    if input.KeyCode == Enum.KeyCode.End then
        Win:SetLauncherVisible(not FloatClick.Visible)
    elseif input.KeyCode == Enum.KeyCode.Delete then
        Win:Destroy()
    end
end)

--// ---------------- Animação de abertura ----------------
local function playIntro()
    Win:SetVisible(false)
    local cover = new("Frame", {
        Name = "RN_Intro", Size = UDim2.fromScale(1, 1), BackgroundColor3 = Color3.new(0, 0, 0),
        BorderSizePixel = 0, ZIndex = 1000, Active = true,
    }, Root)
    local logo = new("Frame", {
        Name = "LogoCircle", AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.5),
        Size = UDim2.fromOffset(0, 0), BackgroundColor3 = Color3.fromRGB(215, 0, 0), BorderSizePixel = 0, ZIndex = 1001,
    }, cover)
    new("UICorner", {CornerRadius = UDim.new(1, 0)}, logo)
    stroke(logo, Color3.fromRGB(255, 65, 65), 3, 0.15)
    local txt = makeLabel(logo, "RN\nTEAM", {
        Position = UDim2.fromOffset(9, 9), Size = UDim2.new(1, -18, 1, -18), TextColor3 = Color3.new(1, 1, 1),
        TextScaled = true, Font = Enum.Font.GothamBlack, TextXAlignment = Enum.TextXAlignment.Center, ZIndex = 1002,
    })
    new("UITextSizeConstraint", {MinTextSize = 12, MaxTextSize = 42}, txt)

    TweenService:Create(logo, TweenInfo.new(0.65, Enum.EasingStyle.Back, Enum.EasingDirection.Out),
        {Size = UDim2.fromOffset(120, 120)}):Play()
    task.wait(1.4)
    if not Win:IsAlive() then
        return
    end
    TweenService:Create(logo, TweenInfo.new(0.9, Enum.EasingStyle.Quart, Enum.EasingDirection.In),
        {Rotation = 720, Size = UDim2.fromOffset(0, 0)}):Play()
    TweenService:Create(txt, TweenInfo.new(0.55, Enum.EasingStyle.Quad, Enum.EasingDirection.In),
        {TextTransparency = 1}):Play()
    task.wait(0.9)
    if not Win:IsAlive() then
        return
    end
    TweenService:Create(cover, TweenInfo.new(0.35, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
        {BackgroundTransparency = 1}):Play()
    task.wait(0.35)
    cover:Destroy()
end


--// ============================================================
--//  ABA STATUS: FPS e ping
--// ============================================================
local LEVEL_COLOR = {
    INFO = Color3.fromRGB(147, 197, 253),
    SUCCESS = Color3.fromRGB(74, 222, 128),
    WARNING = Color3.fromRGB(251, 191, 36),
    ERROR = Color3.fromRGB(248, 113, 113),
}
local function hex(c)
    return string.format("#%02x%02x%02x", math.floor(c.R * 255 + 0.5), math.floor(c.G * 255 + 0.5), math.floor(c.B * 255 + 0.5))
end
local function esc(s)
    s = tostring(s)
    s = s:gsub("&", "&amp;")
    s = s:gsub("<", "&lt;")
    s = s:gsub(">", "&gt;")
    return s
end

do
    -- FPS e ping medidos de verdade (sem valores inventados)
    local Stats = game:GetService("Stats")
    local fpsValue, fpsAcc, fpsFrames = nil, 0, 0
    connect(RunService.RenderStepped, function(dt)
        fpsAcc = fpsAcc + dt
        fpsFrames = fpsFrames + 1
        if fpsAcc >= 0.5 then
            fpsValue = fpsFrames / fpsAcc
            fpsAcc, fpsFrames = 0, 0
        end
    end)
    local function readPing()
        local ok, v = pcall(function()
            return Stats.Network.ServerStatsItem["Data Ping"]:GetValue()
        end)
        if ok and type(v) == "number" then
            return v, false
        end
        local ok2, p = pcall(function()
            return LocalPlayer:GetNetworkPing()
        end)
        if ok2 and type(p) == "number" then
            return p * 1000, true
        end
        return nil
    end

    local ov = tabStatus:AddSection("📊 FPS e Ping", true)
    local fpsLabel = ov:AddLabel("FPS: medindo...")
    local pingLabel = ov:AddLabel("Ping: medindo...")

    task.spawn(function()
        while Win:IsAlive() do
            task.wait(0.5)
            if tabStatus.Page.Visible then
                fpsLabel:Set(fpsValue and string.format("FPS: %d", math.floor(fpsValue + 0.5)) or "FPS: medindo...")
                local ping, approx = readPing()
                pingLabel:Set(ping and string.format("Ping: %s%d ms", approx and "~" or "", math.floor(ping + 0.5)) or "Ping: indisponível neste ambiente")
            end
        end
    end)
end

--// ============================================================
--//  ABA EVENTOS: Central de Eventos
--// ============================================================
do
    local filterLevel, filterText = "Todas", ""
    local ctl = tabEvents.Page

    local sc = tabEvents:AddSection("📜 Central de Eventos", true)
    local summary = sc:AddLabel("")
    sc:AddInput({
        Name = "Pesquisar mensagens", Default = "", Placeholder = "Digite para filtrar",
        Callback = function(v)
            filterText = tostring(v or ""):lower()
            Win._eventsDirty = true
        end,
    })
    sc:AddDropdown({
        Name = "Categoria", Flag = "ev_filter", Options = {"Off", "Todas", "INFO", "SUCCESS", "WARNING", "ERROR"}, Default = "Todas",
        Callback = function(v)
            filterLevel = v or "Todas"
            Win._eventsDirty = true
        end,
    })
    sc:AddButton({Name = "Limpar histórico", Callback = function()
        Win:ClearEvents()
        Win:Log("INFO", "Histórico de eventos limpo")
    end})

    local sl = tabEvents:AddSection("🧾 Histórico", true)
    local holder = new("ScrollingFrame", {
        Size = UDim2.new(1, 0, 0, 300), BackgroundColor3 = Theme.Background, BackgroundTransparency = 0.1,
        BorderSizePixel = 0, ScrollBarThickness = 4, CanvasSize = UDim2.new(), AutomaticCanvasSize = Enum.AutomaticSize.Y,
        LayoutOrder = sl:_nextOrder(),
    }, sl._frame)
    corner(holder, 8)
    new("UIListLayout", {Padding = UDim.new(0, 4), SortOrder = Enum.SortOrder.LayoutOrder}, holder)
    padding(holder, 6, 6, 6, 6)

    local MAX_SHOWN = 100
    local function render()
        for _, c in ipairs(holder:GetChildren()) do
            if c:IsA("GuiObject") then
                c:Destroy()
            end
        end
        local shown = 0
        if filterLevel == "Off" then
            makeLabel(holder, "Exibição desligada (Off). Os eventos continuam sendo registrados; escolha outra categoria para ver.", {
                Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, TextWrapped = true,
                TextXAlignment = Enum.TextXAlignment.Center, TextColor3 = Theme.SubText, TextSize = 12,
            })
        end
        for i = #Win.Events, 1, -1 do
            if filterLevel == "Off" then
                break
            end
            local e = Win.Events[i]
            if (filterLevel == "Todas" or e.level == filterLevel)
                and (filterText == "" or e.msg:lower():find(filterText, 1, true) or (e.detail and e.detail:lower():find(filterText, 1, true))) then
                shown = shown + 1
                local text = string.format('<font color="#6b7280">%s</font> <b><font color="%s">%s</font></b> %s%s',
                    e.time, hex(LEVEL_COLOR[e.level]), e.level, esc(e.msg), e.count > 1 and (" ×" .. e.count) or "")
                if e.detail then
                    text = text .. '\n<font color="#9ca3af" size="11">' .. esc(e.detail) .. "</font>"
                end
                makeLabel(holder, text, {
                    Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, TextWrapped = true, RichText = true,
                    TextSize = 12, LayoutOrder = shown,
                })
                if shown >= MAX_SHOWN then
                    break
                end
            end
        end
        if shown == 0 and filterLevel ~= "Off" then
            makeLabel(holder, "Nenhum evento para este filtro.", {
                Size = UDim2.new(1, 0, 0, 24), TextXAlignment = Enum.TextXAlignment.Center, TextColor3 = Theme.SubText, TextSize = 12,
            })
        end
        local c = Win:EventCounts()
        summary:Set(string.format("INFO %d   SUCCESS %d   WARNING %d   ERROR %d   (guarda os últimos 300 registros; mostrando até %d)",
            c.INFO, c.SUCCESS, c.WARNING, c.ERROR, MAX_SHOWN))
    end

    Win._eventsDirty = true
    Win:OnEvent(function()
        Win._eventsDirty = true
    end)
    task.spawn(function()
        while Win:IsAlive() do
            task.wait(0.3)
            if Win._eventsDirty and tabEvents.Page.Visible then
                Win._eventsDirty = false
                local ok, err = pcall(render)
                if not ok then
                    warn("[RN TEAM] eventos: " .. tostring(err))
                end
            end
        end
    end)
end

--// ============================================================
--//  GRAVADOR DE ROTA (aba Farm)
--// ============================================================
do
    local MAX_POINTS, MIN_STEP, SAMPLE_DT, ROUTE_COUNT = 1500, 3, 0.15, 5

    -- rotas guardadas em listas planas {x1,y1,z1,x2,y2,z2,...}; entram no RN_TEAM_SAVE.json
    local routes = {}
    local savedRoutes = Win.Saved.routes
    for i = 1, ROUTE_COUNT do
        local r = {}
        local src = type(savedRoutes) == "table" and savedRoutes[i] or nil
        if type(src) == "table" then
            for _, v in ipairs(src) do
                if type(v) == "number" then
                    r[#r + 1] = v
                else
                    r = {}
                    break
                end
            end
            if #r % 3 ~= 0 then
                r = {}
            end
        end
        routes[i] = r
    end
    Win.Elements.routes = {
        Get = function()
            return routes
        end,
        Serialize = function()
            return routes
        end,
        Set = function() end,
        Default = nil,
    }

    local function slotIndex()
        return tonumber(tostring(F.route_slot or "Rota 1"):match("%d+")) or 1
    end
    local function r1(x)
        return math.floor(x * 10 + 0.5) / 10
    end
    local function routeLength(r)
        local len = 0
        for i = 4, #r, 3 do
            len = len + (Vector3.new(r[i], r[i + 1], r[i + 2]) - Vector3.new(r[i - 3], r[i - 2], r[i - 1])).Magnitude
        end
        return len
    end

    local rs = tabFarm:AddSection("🛤️ Gravador de Rota")
    local infoLbl
    local function refreshInfo()
        if not infoLbl then
            return
        end
        local n = slotIndex()
        local r = routes[n]
        if #r == 0 then
            infoLbl:Set("Rota " .. n .. ": vazia")
        else
            infoLbl:Set(string.format("Rota %d: %d pontos, cerca de %d studs", n, math.floor(#r / 3), math.floor(routeLength(r) + 0.5)))
        end
    end

    local rec, play = nil, nil

    rs:AddDropdown({
        Name = "Rota", Flag = "route_slot", Default = "Rota 1",
        Options = {"Rota 1", "Rota 2", "Rota 3", "Rota 4", "Rota 5"},
        Callback = function()
            refreshInfo()
        end,
    })
    infoLbl = rs:AddLabel("")
    refreshInfo()

    rs:AddToggle({
        Name = "Gravar rota (ande e ele grava)", Flag = "route_rec", Default = false, NoSave = true,
        Callback = function(on)
            if on then
                local root = getRoot()
                if not root or not isAlive(LocalPlayer.Character) then
                    notify("Gravador", "Precisa de um personagem vivo para gravar.", "warning")
                    Win.Elements.route_rec:Set(false, true)
                    return
                end
                if F.route_play then
                    Win.Elements.route_play:Set(false, false)
                end
                rec = {slot = slotIndex(), pts = {r1(root.Position.X), r1(root.Position.Y), r1(root.Position.Z)}, last = root.Position, t = 0}
                notify("Gravador", "Gravando a Rota " .. rec.slot .. " (substitui a anterior). Ande pelo caminho e desligue para salvar.", "info")
            else
                local r = rec
                rec = nil
                if r then
                    if #r.pts >= 6 then
                        routes[r.slot] = r.pts
                        local saved = Win:Save()
                        refreshInfo()
                        if saved then
                            notify("Gravador", "Rota " .. r.slot .. " salva: " .. math.floor(#r.pts / 3) .. " pontos.", "success")
                        else
                            notify("Gravador", "Rota " .. r.slot .. " guardada só na memória (não foi possível gravar o arquivo).", "warning")
                        end
                    else
                        notify("Gravador", "Rota muito curta; nada foi salvo.", "warning")
                    end
                end
            end
        end,
    })
    rs:AddToggle({
        Name = "Reproduzir rota", Flag = "route_play", Default = false, NoSave = true,
        Callback = function(on)
            if on then
                if F.route_rec then
                    Win.Elements.route_rec:Set(false, false)
                end
                local n = slotIndex()
                local r = routes[n]
                if #r < 6 then
                    notify("Gravador", "A Rota " .. n .. " está vazia.", "warning")
                    Win.Elements.route_play:Set(false, true)
                    return
                end
                local root = getRoot()
                if not root or not isAlive(LocalPlayer.Character) then
                    notify("Gravador", "Precisa de um personagem vivo para reproduzir.", "warning")
                    Win.Elements.route_play:Set(false, true)
                    return
                end
                if not Mover.hold("route", root) then
                    notify("Gravador", "Outro movimento (farm de itens, perseguição) está em andamento. Desligue-o primeiro.", "warning")
                    Win.Elements.route_play:Set(false, true)
                    return
                end
                local pts, idx, best = {}, 1, math.huge
                for i = 1, #r, 3 do
                    local p = Vector3.new(r[i], r[i + 1], r[i + 2])
                    pts[#pts + 1] = p
                    local d = (p - root.Position).Magnitude
                    if d < best then
                        best, idx = d, #pts
                    end
                end
                play = {pts = pts, idx = idx, root = root}
            else
                play = nil
                Mover.release("route")
            end
        end,
    })
    rs:AddToggle({Name = "Repetir em loop", Flag = "route_loop", Default = false, Feature = false})
    rs:AddSlider({Name = "Velocidade", Flag = "route_speed", Min = 10, Max = 500, Default = 100, Step = 5})
    rs:AddButton({Name = "Apagar esta rota", Callback = function()
        local n = slotIndex()
        if rec and rec.slot == n then
            notify("Gravador", "Pare a gravação antes de apagar.", "warning")
            return
        end
        routes[n] = {}
        local saved = Win:Save()
        refreshInfo()
        notify("Gravador", saved and ("Rota " .. n .. " apagada.") or ("Rota " .. n .. " apagada da memória (arquivo não gravado)."), saved and "success" or "warning")
    end})
    rs:AddLabel("A reprodução anda em linha reta entre os pontos, atravessando paredes, e começa pelo ponto mais próximo de você.")

    -- gravação: amostra a posição a cada 0,15 s e guarda só pontos com pelo menos 3 studs de distância
    connect(RunService.Heartbeat, function(dt)
        if not rec then
            return
        end
        local root = getRoot()
        if not root or not isAlive(LocalPlayer.Character) then
            Mon.tick("rrec", "aguardando o personagem", true)
            return
        end
        rec.t = rec.t + dt
        if rec.t >= SAMPLE_DT then
            rec.t = 0
            local p = root.Position
            if (p - rec.last).Magnitude >= MIN_STEP then
                local n = #rec.pts
                rec.pts[n + 1], rec.pts[n + 2], rec.pts[n + 3] = r1(p.X), r1(p.Y), r1(p.Z)
                rec.last = p
                if #rec.pts / 3 >= MAX_POINTS then
                    Win:Log("WARNING", "Gravador: limite de " .. MAX_POINTS .. " pontos atingido; gravação encerrada")
                    Win.Elements.route_rec:Set(false, false)
                    return
                end
            end
        end
        Mon.tick("rrec", math.floor(#rec.pts / 3) .. " ponto(s) gravado(s)")
    end, "rrec")

    -- reprodução: andador contínuo (um único movimento reservado via Mover.hold)
    connect(RunService.Heartbeat, function(dt)
        if not (F.route_play and play) then
            return
        end
        local root = getRoot()
        if not root or not isAlive(LocalPlayer.Character) then
            Mon.tick("rplay", "aguardando o personagem (respawn)", true)
            return
        end
        if root ~= play.root then -- respawn: retoma pelo ponto mais próximo
            if not Mover.hold("route", root) then
                Mon.tick("rplay", "movimento ocupado por outro sistema", true)
                return
            end
            play.root = root
            local best = math.huge
            for i, p in ipairs(play.pts) do
                local d = (p - root.Position).Magnitude
                if d < best then
                    best, play.idx = d, i
                end
            end
        end
        local pos = root.Position
        local target = play.pts[play.idx]
        local vec = target - pos
        local dist = vec.Magnitude
        local step = math.max(tonumber(F.route_speed) or 100, 1) * dt
        local newPos, finished = nil, false
        if dist <= step then
            newPos = target
            play.idx = play.idx + 1
            if play.idx > #play.pts then
                if F.route_loop then
                    play.idx = 1 -- volta andando até o primeiro ponto
                else
                    finished = true
                end
            end
        else
            newPos = pos + vec.Unit * step
        end
        local rot = root.CFrame - root.CFrame.Position
        local flat = Vector3.new(vec.X, 0, vec.Z)
        if flat.Magnitude > 0.05 then
            rot = CFrame.lookAt(Vector3.zero, flat)
        end
        root.CFrame = CFrame.new(newPos) * rot
        root.AssemblyLinearVelocity = Vector3.zero
        Mon.tick("rplay", string.format("ponto %d/%d", math.min(play.idx, #play.pts), #play.pts))
        if finished then
            Win.Elements.route_play:Set(false, false)
            notify("Gravador", "Rota concluída.", "success")
        end
    end, "rplay")

    Win:OnDestroy(function()
        rec, play = nil, nil
        Mover.release("route")
    end)
end

--// ============================================================
--//  REEXECUTAR AO TROCAR DE SERVIDOR (aba Config)
--// ============================================================
do
    local qot = (type(queue_on_teleport) == "function" and queue_on_teleport)
        or (type(queueonteleport) == "function" and queueonteleport)
        or (type(syn) == "table" and type(syn.queue_on_teleport) == "function" and syn.queue_on_teleport)
        or (type(fluxus) == "table" and type(fluxus.queue_on_teleport) == "function" and fluxus.queue_on_teleport)
        or nil

    -- se este script foi reexecutado pelo próprio recurso, confirma (só agora é "concluído")
    local okG, genv = pcall(function()
        return getgenv and getgenv() or nil
    end)
    if okG and type(genv) == "table" and genv.RN_TEAM_REEXEC then
        genv.RN_TEAM_REEXEC = nil
        Win:Log("SUCCESS", "Reexecutado automaticamente após a troca de servidor")
    end

    local rx = tabCfg:AddSection("🔁 Reexecutar ao Trocar de Servidor")
    rx:AddLabel(qot and "queue_on_teleport disponível neste executor." or "⚠️ Este executor não tem queue_on_teleport: o recurso não consegue funcionar aqui.")
    rx:AddToggle({Name = "Reexecutar ao trocar de servidor", Flag = "reexec_on", Default = false})
    local slotOptions = {"Nenhum"}
    for i = 1, 10 do
        slotOptions[#slotOptions + 1] = "Slot " .. i
    end
    rx:AddDropdown({Name = "Reexecutar também o slot do Executor", Flag = "reexec_slot", Options = slotOptions, Default = "Nenhum"})
    rx:AddLabel("Ligado: o RN TEAM se executa sozinho ao entrar no próximo servidor.")

    -- link fixo do próprio RN TEAM (usado na reexecução; não é mais digitado na interface)
    local RN_DEFAULT_URL = "https://pastefy.app/fAo2cDay/raw"

    -- procura uma cópia local do script na pasta do executor (workspace / autoexec)
    local function findLocalCopy()
        if not (type(isfile) == "function" and type(readfile) == "function") then
            return nil
        end
        local names = {"RN_TEAM_v2.lua", "RN_TEAM.lua"}
        local dirs = {"", "autoexec/", "Autoexec/", "AutoExec/", "autoexecute/"}
        for _, d in ipairs(dirs) do
            for _, n in ipairs(names) do
                local path = d .. n
                local ok, found = pcall(isfile, path)
                if ok and found then
                    return path
                end
            end
        end
        return nil
    end

    local function buildQueuedCode()
        local parts = {
            "if not game:IsLoaded() then game.Loaded:Wait() end",
            "pcall(function() if getgenv then getgenv().RN_TEAM_REEXEC = true end end)",
        }
        local base = #parts
        local url = trim(RN_DEFAULT_URL)
        if url == "" and okG and type(genv) == "table" and type(genv.RN_TEAM_URL) == "string" then
            url = trim(genv.RN_TEAM_URL)
        end
        if url ~= "" then
            -- guarda o link no próximo servidor também, para a cadeia continuar sozinha
            parts[#parts + 1] = string.format("pcall(function() if getgenv then getgenv().RN_TEAM_URL = %q end end)", url)
            parts[#parts + 1] = string.format("pcall(function() loadstring(game:HttpGet(%q))() end)", url)
        else
            local path = findLocalCopy()
            if path then
                parts[#parts + 1] = string.format("pcall(function() loadstring(readfile(%q))() end)", path)
            end
        end
        local n = tonumber(tostring(F.reexec_slot or ""):match("%d+"))
        if n then
            local slotsEl = Win.Elements.exec_slots
            local code = slotsEl and slotsEl:Get()[n]
            if type(code) == "string" and trim(code) ~= "" then
                parts[#parts + 1] = string.format("pcall(function() loadstring(%q)() end)", code)
            end
        end
        if #parts == base then
            return nil
        end
        return table.concat(parts, "\n")
    end

    -- enfileira no início do teleporte, com as configurações do momento (uma vez por teleporte)
    local queuedNow = false
    local tpConn = connect(LocalPlayer.OnTeleport, function(state)
        if state == Enum.TeleportState.Failed then
            queuedNow = false
            return
        end
        if not F.reexec_on or queuedNow then
            return
        end
        if state == Enum.TeleportState.Started or state == Enum.TeleportState.RequestedFromServer
            or state == Enum.TeleportState.InProgress or state == Enum.TeleportState.WaitingForServer then
            local code = buildQueuedCode()
            if not code then
                Win:Log("WARNING", "Reexecução ligada, mas não há link, cópia local (RN_TEAM_v2.lua) nem slot; nada foi enfileirado")
                return
            end
            if not qot then
                Win:Log("ERROR", "Reexecução: o executor não tem queue_on_teleport")
                return
            end
            local ok, err = pcall(qot, code)
            if ok then
                queuedNow = true
                Win:Log("SUCCESS", "Reexecução enfileirada para o próximo servidor")
            else
                Win:Log("ERROR", "Reexecução: falha ao enfileirar", tostring(err))
            end
        end
    end)

    Win:Monitor("reexec_on", function(control)
        if control ~= true then
            return "inactive"
        end
        if not qot then
            return "error", "o executor não tem queue_on_teleport"
        end
        if not buildQueuedCode() then
            return "waiting", "sem link configurado no script"
        end
        if not (tpConn and tpConn.Connected) then
            return "error", "o ouvinte de teleporte não está conectado"
        end
        return "active", "pronto: será enfileirado quando o teleporte começar"
    end)
end

--// ============================================================
--//  SONDAS: ligam cada controle ao que a função realmente executou
--// ============================================================
do
    local P = Mon.probe
    local map = {
        aim_on = "aim", aimn_on = "aimn", hb_on = "hb", hbn_on = "hbn",
        esp_box = "esp", esp_tracer = "esp", esp_health = "esp", esp_name = "esp", esp_dist = "esp",
        esp_xray = "esp", esp_role = "esp", chams_on = "chams", espo_on = "espo", spec_on = "spec",
        fp_on = "fp", fn_on = "fn", fi_on = "fi", ch_on = "ch",
        mv_speed_on = "speed", mv_jump_on = "jump", fly_on = "fly", antivoid = "antivoid", grav_on = "grav",
        noclip = "noclip", bhop = "bhop", spin_on = "spin", antikb = "antikb",
        fb_on = "fb", nofog = "nofog", light_time_on = "ltime", light_bright_on = "lbright",
        cam_fov_on = "camfov", zoom_on = "zoom", antiui = "antiui",
        ia_loop_interact = "ia_interact", ia_loop_collect = "ia_collect", ia_loop_tp = "ia_tp",
        route_rec = "rrec", route_play = "rplay",
    }
    for flag, id in pairs(map) do
        Win:Monitor(flag, P(id))
    end
    -- Infinite Jump só reage a eventos: a prova é o ouvinte conectado
    Win:Monitor("infjump", function(control)
        if control ~= true then
            return "inactive"
        end
        local c = Mon.conns.infjump
        if c and c.Connected then
            return "active", "ouvindo pedidos de pulo"
        end
        return "error", "o ouvinte de pulo não está conectado"
    end)
end

Win:SelectTab(Win.Tabs[1])
Win:EndBoot() -- a partir daqui, mudanças de controle entram na Central de Eventos
task.spawn(function()
    if F.intro_on ~= false then
        local ok, err = pcall(playIntro)
        if not ok then
            warn("[RN TEAM] intro: " .. tostring(err))
            pcall(function()
                local c = Root:FindFirstChild("RN_Intro")
                if c then
                    c:Destroy()
                end
            end)
        end
    end
    if Win:IsAlive() then
        Win:SetVisible(true)
        Win:Log("SUCCESS", "RN TEAM v2 carregada e visível")
        Win:Notify({
            Title = "RN TEAM carregada",
            Content = "Toque no botão flutuante para abrir ou fechar o menu.",
            Duration = 4,
        })
    end
end)
