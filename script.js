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
      Sec:AddMultiDropdown{Name, Flag, Options, Default, Source, AutoRefresh, Callback(valores, info), Searchable, Sort}
         (AddDropdown{Multi = true} usa o mesmo motor; nomes repetidos viram uma opção com contagem)
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

local errorSink = nil -- recebe os erros de callbacks (ligado à Central de Eventos pela janela)
local function fire(callback, ...)
    if type(callback) ~= "function" then
        return
    end
    local ok, err = pcall(callback, ...)
    if not ok then
        warn("[NovaUI] Erro em callback: " .. tostring(err))
        if errorSink then
            pcall(errorSink, tostring(err))
        end
    end
end

-- pesquisa sem diferenciar maiúsculas/acentos ("Dragão" = "dragao")
local FOLD = {
    {"á", "a"}, {"à", "a"}, {"â", "a"}, {"ã", "a"}, {"ä", "a"}, {"Á", "a"}, {"À", "a"}, {"Â", "a"}, {"Ã", "a"}, {"Ä", "a"},
    {"é", "e"}, {"è", "e"}, {"ê", "e"}, {"ë", "e"}, {"É", "e"}, {"È", "e"}, {"Ê", "e"}, {"Ë", "e"},
    {"í", "i"}, {"ì", "i"}, {"î", "i"}, {"ï", "i"}, {"Í", "i"}, {"Ì", "i"}, {"Î", "i"}, {"Ï", "i"},
    {"ó", "o"}, {"ò", "o"}, {"ô", "o"}, {"õ", "o"}, {"ö", "o"}, {"Ó", "o"}, {"Ò", "o"}, {"Ô", "o"}, {"Õ", "o"}, {"Ö", "o"},
    {"ú", "u"}, {"ù", "u"}, {"û", "u"}, {"ü", "u"}, {"Ú", "u"}, {"Ù", "u"}, {"Û", "u"}, {"Ü", "u"},
    {"ç", "c"}, {"Ç", "c"}, {"ñ", "n"}, {"Ñ", "n"},
}
local function foldText(text)
    text = tostring(text):lower()
    for _, p in ipairs(FOLD) do
        text = text:gsub(p[1], p[2])
    end
    return text
end

-- ordem natural: "Zombie 2" vem antes de "Zombie 10"
local function naturalKey(text)
    return (foldText(text):gsub("%d+", function(d)
        return string.rep("0", math.max(0, 12 - #d)) .. d
    end))
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
    local notifySeen, notifyPrune = {}, 0
    local activeDrag = nil

    Theme.Accent = opts.Accent or DEFAULT_ACCENT

    local trackAdds = 0
    local function track(conn)
        table.insert(connections, conn)
        trackAdds = trackAdds + 1
        if trackAdds >= 200 then -- descarta conexões de instâncias já destruídas (evita vazamento)
            trackAdds = 0
            local keep = {}
            for _, c in ipairs(connections) do
                local ok, connected = pcall(function()
                    return c.Connected
                end)
                if not ok or connected then
                    keep[#keep + 1] = c
                end
            end
            connections = keep
        end
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

    errorSink = function(err)
        Window:Log("ERROR", "Erro em callback de um controle", err)
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

    -- Section dentro de Section (recolhível). Devolve um objeto com os mesmos métodos Add*.
    function SectionMT:AddSubSection(name, startOpen)
        local box = new("Frame", {
            Name = "Sub_" .. tostring(name), BackgroundColor3 = Theme.Background, BackgroundTransparency = 0.4,
            BorderSizePixel = 0, Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y,
            LayoutOrder = self:_nextOrder(),
        }, self._frame)
        corner(box, 8)
        stroke(box, Theme.Stroke, 1)
        new("UIListLayout", {Padding = UDim.new(0, 6), SortOrder = Enum.SortOrder.LayoutOrder}, box)
        padding(box, 6, 6, 6, 6)
        local open = startOpen ~= false
        local header = new("TextButton", {
            Size = UDim2.new(1, 0, 0, 26), BackgroundTransparency = 1, AutoButtonColor = false, Text = "",
            Font = FONT_BOLD, TextSize = 13, TextXAlignment = Enum.TextXAlignment.Left,
            TextTruncate = Enum.TextTruncate.AtEnd, LayoutOrder = 0,
        }, box)
        local body = new("Frame", {
            BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y,
            LayoutOrder = 1, Visible = open,
        }, box)
        new("UIListLayout", {Padding = UDim.new(0, 6), SortOrder = Enum.SortOrder.LayoutOrder}, body)
        local function render()
            header.Text = tostring(name)
            header.TextColor3 = open and Theme.Accent or Theme.Text
            body.Visible = open
        end
        render()
        bindAccent(render)
        header.MouseButton1Click:Connect(function()
            open = not open
            render()
        end)
        return setmetatable({_frame = body, _page = self._page, _order = 0, _tabName = self._tabName}, SectionMT)
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
                local txt = (raw:gsub(",", ".")):match("^%s*(.-)%s*$")
                local n = tonumber(txt)
                if not n or n ~= n or n == math.huge or n == -math.huge then
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

    -- MultiDropdown v3: lista virtualizada (só as linhas visíveis existem), nomes repetidos agrupados com
    -- contagem (ex.: 7 NPCs "Zombie" viram uma opção "Zombie ×7"), pesquisa sem acento, atualização
    -- automática por Source e preservação/remoção segura das seleções.
    function SectionMT:AddMultiDropdown(opts2)
        opts2 = opts2 or {}
        local compat = opts2._compat == true -- vindo de AddDropdown{Multi = true}: Refresh(lista) substitui tudo
        local ITEM_H = UserInputService.TouchEnabled and 32 or 28
        local GAP = 2
        local STEP = ITEM_H + GAP
        local SEARCH_H, BAR_H, INFO_H = 30, 28, 16
        local sortList = opts2.Sort
        if sortList == nil then
            sortList = opts2.Source ~= nil
        end

        -- aceita strings (repetidas viram contagem), {Name=, Count=, Label=} ou {nome, ...}
        local function normalize(list)
            local names, set, cnt, fold, keys = {}, {}, {}, {}, {}
            if type(list) == "table" then
                for _, o in ipairs(list) do
                    local name, c
                    if type(o) == "table" then
                        name = o.Name or o.name or o.Value or o.value or o[1]
                        c = tonumber(o.Count or o.count) or 1
                    else
                        name, c = o, 1
                    end
                    if name ~= nil then
                        name = tostring(name)
                        if name ~= "" then
                            if not set[name] then
                                set[name] = true
                                names[#names + 1] = name
                                cnt[name] = 0
                                fold[name] = foldText(name)
                            end
                            cnt[name] = cnt[name] + math.max(math.floor(c), 1)
                        end
                    end
                end
            end
            if sortList then
                for _, n in ipairs(names) do
                    keys[n] = naturalKey(n)
                end
                table.sort(names, function(a, b)
                    local ka, kb = keys[a], keys[b]
                    if ka == kb then
                        return a < b
                    end
                    return ka < kb
                end)
            end
            return names, set, cnt, fold
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
            local out = table.create(#t)
            for i, v in ipairs(t) do
                out[i] = v
            end
            return out
        end
        local function toSelectionSet(values)
            local out = {}
            if type(values) == "string" then
                out[values] = true
            elseif type(values) == "table" then
                for k, v in pairs(values) do
                    if type(k) == "number" then
                        out[tostring(v)] = true
                    elseif v then
                        out[tostring(k)] = true
                    end
                end
            end
            return out
        end

        local options, optionSet, counts, folded = normalize(opts2.Options)
        local selected = {}
        local view = options -- opções visíveis (filtradas); sem pesquisa é a própria lista
        local query = ""
        local isOpen = false
        local lastRefresh = os.clock()
        local lastCommitted = {}
        local dupGroups = 0
        local pool = {}
        local ordered = opts2.Ordered == true -- guarda a ORDEM em que as opções foram marcadas
        local orderList, orderIdx = {}, {}
        local el = {IsMulti = true, Name = opts2.Name, AutoRefresh = tonumber(opts2.AutoRefresh)}
        local toggle, commit

        local function countDuplicates()
            local n = 0
            for _, name in ipairs(options) do
                if counts[name] > 1 then
                    n = n + 1
                end
            end
            dupGroups = n
        end
        countDuplicates()

        local function valuesToList(values) -- lista (na ordem dada) a partir de lista, mapa ou texto
            local out, seen = {}, {}
            if type(values) == "string" then
                out[1] = values
            elseif type(values) == "table" then
                for _, v in ipairs(values) do
                    local name = tostring(v)
                    if not seen[name] then
                        seen[name] = true
                        out[#out + 1] = name
                    end
                end
                local extra = {}
                for k, v in pairs(values) do
                    if type(k) ~= "number" and v then
                        local name = tostring(k)
                        if not seen[name] then
                            seen[name] = true
                            extra[#extra + 1] = name
                        end
                    end
                end
                table.sort(extra)
                for _, name in ipairs(extra) do
                    out[#out + 1] = name
                end
            end
            return out
        end
        local function selAdd(name)
            if not selected[name] then
                selected[name] = true
                if ordered then
                    orderList[#orderList + 1] = name
                end
            end
        end
        local function selRemove(name)
            if selected[name] then
                selected[name] = nil
                if ordered then
                    for i = #orderList, 1, -1 do
                        if orderList[i] == name then
                            table.remove(orderList, i)
                            break
                        end
                    end
                end
            end
        end
        local function selClear()
            selected = {}
            orderList = {}
        end
        local function rebuildOrderIdx()
            orderIdx = {}
            for i, name in ipairs(orderList) do
                orderIdx[name] = i
            end
        end

        local function selectedList()
            local out = {}
            if ordered then
                for _, name in ipairs(orderList) do
                    if selected[name] then
                        out[#out + 1] = name
                    end
                end
                return out
            end
            if #options > 0 then
                for _, o in ipairs(options) do
                    if selected[o] then
                        out[#out + 1] = o
                    end
                end
            else -- lista vazia: as seleções salvas ficam pendentes (não dá para validá-las agora)
                for name in pairs(selected) do
                    out[#out + 1] = name
                end
                table.sort(out)
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

        local y = ROW_H + 4
        local searchBox
        if opts2.Searchable ~= false then
            searchBox = new("TextBox", {
                Position = UDim2.new(0, 6, 0, y), Size = UDim2.new(1, -12, 0, SEARCH_H),
                BackgroundColor3 = Theme.Background, BorderSizePixel = 0, ClearTextOnFocus = false,
                PlaceholderText = "Pesquisar...", PlaceholderColor3 = Theme.SubText, Text = "",
                Font = FONT, TextSize = 13, TextColor3 = Theme.Text, TextXAlignment = Enum.TextXAlignment.Left,
            }, wrapper)
            corner(searchBox, 6)
            padding(searchBox, 8, 0, 8, 0)
        end
        y = y + SEARCH_H + 4
        local bar = new("Frame", {
            Position = UDim2.new(0, 6, 0, y), Size = UDim2.new(1, -12, 0, BAR_H), BackgroundTransparency = 1,
        }, wrapper)
        new("UIListLayout", {
            FillDirection = Enum.FillDirection.Horizontal, Padding = UDim.new(0, 4), SortOrder = Enum.SortOrder.LayoutOrder,
        }, bar)
        local function barButton(text, order)
            local b = new("TextButton", {
                LayoutOrder = order, Size = UDim2.new(1 / 3, -3, 1, 0), BackgroundColor3 = Theme.Background,
                BorderSizePixel = 0, AutoButtonColor = true, Text = text, Font = FONT_BOLD, TextSize = 12,
                TextColor3 = Theme.Text,
            }, bar)
            corner(b, 6)
            return b
        end
        local allBtn = barButton("Todos", 1)
        local clearBtn = barButton("Limpar", 2)
        local invertBtn = barButton("Inverter", 3)
        y = y + BAR_H + 4
        local listY = y
        local list = new("ScrollingFrame", {
            Position = UDim2.new(0, 6, 0, listY), Size = UDim2.new(1, -12, 0, STEP + 4), BackgroundColor3 = Theme.Background,
            BorderSizePixel = 0, ScrollBarThickness = 3, CanvasSize = UDim2.new(),
            ScrollingDirection = Enum.ScrollingDirection.Y,
        }, wrapper)
        corner(list, 6)
        local emptyLabel = makeLabel(list, "", {
            Size = UDim2.new(1, 0, 0, ITEM_H), Position = UDim2.fromOffset(0, 2), TextXAlignment = Enum.TextXAlignment.Center,
            TextColor3 = Theme.SubText, TextSize = 12, Visible = false,
        })
        local infoLabel = makeLabel(wrapper, "", {
            Position = UDim2.new(0, 8, 0, 0), Size = UDim2.new(1, -16, 0, INFO_H), TextSize = 11,
            TextColor3 = Theme.SubText, TextTruncate = Enum.TextTruncate.AtEnd,
        })

        local function maxRows()
            local vp = viewport()
            local sc = math.max(scaleObj.Scale, 0.1)
            return math.clamp(math.floor((vp.Y / sc * 0.34) / STEP), 3, 8)
        end
        local function listHeight()
            return math.min(math.max(#view, 1), maxRows()) * STEP + 4
        end
        local function openHeight()
            return listY + listHeight() + 4 + INFO_H + 6
        end

        local function newRow()
            local btn = new("TextButton", {
                Size = UDim2.new(1, -8, 0, ITEM_H), BackgroundColor3 = Theme.Element, BorderSizePixel = 0,
                AutoButtonColor = false, Text = "", Visible = false,
            }, list)
            corner(btn, 5)
            local box = new("Frame", {
                AnchorPoint = Vector2.new(0, 0.5), Position = UDim2.new(0, 8, 0.5, 0), Size = UDim2.fromOffset(14, 14),
                BackgroundColor3 = Theme.Off, BorderSizePixel = 0,
            }, btn)
            corner(box, 4)
            local label = makeLabel(btn, "", {
                Position = UDim2.fromOffset(30, 0), Size = UDim2.new(1, -78, 1, 0), TextSize = 13,
                TextTruncate = Enum.TextTruncate.AtEnd,
            })
            local badge = makeLabel(btn, "", {
                AnchorPoint = Vector2.new(1, 0), Position = UDim2.new(1, -8, 0, 0), Size = UDim2.fromOffset(44, ITEM_H),
                TextXAlignment = Enum.TextXAlignment.Right, TextSize = 12, TextColor3 = Theme.SubText,
            })
            local row = {btn = btn, box = box, label = label, badge = badge, name = nil, vi = nil}
            btn.MouseButton1Click:Connect(function()
                if row.name then
                    toggle(row.name)
                end
            end)
            return row
        end

        local function paintRow(row)
            local name = row.name
            if name then
                local on = selected[name] == true
                row.box.BackgroundColor3 = on and Theme.Accent or Theme.Off
                row.label.TextColor3 = on and Theme.Accent or Theme.Text
                row.btn.BackgroundColor3 = on and Theme.ElementHover or Theme.Element
                if ordered then
                    local c = counts[name]
                    row.badge.Text = on and ("#" .. tostring(orderIdx[name] or "")) or ((c and c > 1) and ("×" .. c) or "")
                end
            end
        end

        local function assignRow(row, vi)
            local name = view[vi]
            row.vi, row.name = vi, name
            row.btn.Visible = name ~= nil
            if name then
                row.btn.Position = UDim2.fromOffset(4, 2 + (vi - 1) * STEP)
                row.label.Text = name
                local c = counts[name]
                row.badge.Text = (c and c > 1) and ("×" .. c) or ""
                paintRow(row)
            end
        end

        -- virtualização: só (linhas visíveis + 2) botões existem, mesmo com milhares de opções
        local function layoutRows(force)
            local need = math.ceil(listHeight() / STEP) + 2
            while #pool < need do
                pool[#pool + 1] = newRow()
            end
            local first = math.max(1, math.floor(list.CanvasPosition.Y / STEP) + 1)
            for p = 1, #pool do
                local row = pool[p]
                if p > need then
                    if row.btn.Visible then
                        row.name, row.vi = nil, nil
                        row.btn.Visible = false
                    end
                elseif force or row.vi ~= first + p - 1 then
                    assignRow(row, first + p - 1)
                end
            end
        end
        list:GetPropertyChangedSignal("CanvasPosition"):Connect(function()
            layoutRows(false)
        end)

        local function summaryText(sel)
            if #sel == 0 then
                return (opts2.Placeholder or "Nenhum") .. (#options > 0 and (" (0/" .. #options .. ")") or "")
            elseif #sel <= 2 then
                return table.concat(sel, ", ")
            end
            return #sel .. " de " .. #options
        end
        local function infoText(sel)
            local t = #sel .. " selecionado(s) de " .. #options
            if query ~= "" then
                t = t .. " · filtro: " .. #view
            end
            if dupGroups > 0 then
                t = t .. " · " .. dupGroups .. " nome(s) repetido(s) agrupado(s)"
            end
            return t
        end
        local function refreshHeader(sel)
            valueLabel.Text = summaryText(sel)
            infoLabel.Text = infoText(sel)
        end

        local function applyLayout()
            local h = listHeight()
            list.CanvasSize = UDim2.fromOffset(0, #view * STEP + 4)
            list.Size = UDim2.new(1, -12, 0, h)
            infoLabel.Position = UDim2.new(0, 8, 0, listY + h + 4)
            emptyLabel.Visible = #view == 0
            emptyLabel.Text = #options == 0 and "Sem opções" or "Nenhum resultado"
            if isOpen then
                wrapper.Size = UDim2.new(1, 0, 0, openHeight())
            end
            layoutRows(true)
        end

        local function rebuildView()
            if query == "" then
                view = options
            else
                local out = {}
                for _, o in ipairs(options) do
                    if folded[o]:find(query, 1, true) then
                        out[#out + 1] = o
                    end
                end
                view = out
            end
            applyLayout()
        end
        bindAccent(function()
            for _, row in ipairs(pool) do
                paintRow(row)
            end
        end)

        local function makeInfo(prev, cur)
            local was, now, added, removed = {}, {}, {}, {}
            for _, v in ipairs(prev) do
                was[v] = true
            end
            for _, v in ipairs(cur) do
                now[v] = true
                if not was[v] then
                    added[#added + 1] = v
                end
            end
            for _, v in ipairs(prev) do
                if not now[v] then
                    removed[#removed + 1] = v
                end
            end
            return {added = added, removed = removed, counts = counts}
        end

        commit = function(silent)
            local cur = selectedList()
            if ordered then
                rebuildOrderIdx()
            end
            for _, row in ipairs(pool) do
                paintRow(row)
            end
            refreshHeader(cur)
            local changed = not listsEqual(cur, lastCommitted)
            local prev = lastCommitted
            lastCommitted = copy(cur)
            setFlag(opts2.Flag, copy(cur))
            if changed and not silent then
                fire(opts2.Callback, copy(cur), makeInfo(prev, cur))
                queueSave()
            end
            return changed
        end
        toggle = function(name)
            if selected[name] then
                selRemove(name)
            else
                selAdd(name)
            end
            commit(false)
        end

        --// API do elemento
        function el:Get()
            return selectedList()
        end
        function el:Serialize()
            return selectedList()
        end
        function el:GetOptions()
            return copy(options)
        end
        function el:GetCount(name)
            return counts[tostring(name)] or 0
        end
        function el:GetCounts()
            local out = {}
            for k, v in pairs(counts) do
                out[k] = v
            end
            return out
        end
        function el:IsOpen()
            return isOpen
        end
        function el:LastRefresh()
            return lastRefresh
        end
        function el:Set(values, silent)
            selClear()
            for _, name in ipairs(valuesToList(values)) do
                if #options == 0 or optionSet[name] then -- inexistente é ignorada (pendente se a lista está vazia)
                    selAdd(name)
                end
            end
            return commit(silent)
        end
        function el:SelectAll(silent)
            for _, o in ipairs(view) do
                selAdd(o)
            end
            return commit(silent)
        end
        function el:Clear(silent)
            if query ~= "" then
                for _, o in ipairs(view) do
                    selRemove(o)
                end
            else
                selClear()
            end
            return commit(silent)
        end
        function el:Invert(silent)
            for _, o in ipairs(view) do
                if selected[o] then
                    selRemove(o)
                else
                    selAdd(o)
                end
            end
            return commit(silent)
        end

        -- Atualiza as opções sem recriar a interface. Sem argumento usa a Source.
        -- Nada mudou = nada é redesenhado e nenhum callback é chamado.
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
            if compat and newOptions ~= nil and force == nil then
                force = true
            end
            lastRefresh = os.clock()
            local new, seen, newCounts, newFolded = normalize(source)
            local optionsChanged = not listsEqual(new, options)
            local countsChanged = false
            if not optionsChanged then
                for _, n in ipairs(new) do
                    if newCounts[n] ~= counts[n] then
                        countsChanged = true
                        break
                    end
                end
            end
            if not optionsChanged and not countsChanged then
                return false, #new
            end
            options, optionSet, counts, folded = new, seen, newCounts, newFolded
            countDuplicates()
            local removed = 0
            if #new > 0 then
                for name in pairs(selected) do
                    if not seen[name] then
                        selRemove(name)
                        removed = removed + 1
                    end
                end
            elseif force then
                for _ in pairs(selected) do
                    removed = removed + 1
                end
                selClear()
            end
            rebuildView()
            local changed = false
            if removed > 0 then
                changed = commit(false)
            else
                refreshHeader(lastCommitted)
            end
            if optionsChanged and not booting then
                logLater("opt:" .. tostring(opts2.Flag or opts2.Name), "INFO",
                    string.format("%s: lista atualizada (%d opções)", opts2.Name or "Lista", #new),
                    removed > 0 and (removed .. " seleção(ões) removida(s) por não existirem mais") or nil)
            end
            return true, #new
        end
        el.SetOptions = el.Refresh

        --// eventos de interface
        local function setOpen(open)
            isOpen = open
            if open and opts2.Source then
                el:Refresh()
            end
            if open then
                applyLayout()
            end
            tween(arrow, 0.15, {Rotation = open and 90 or 0})
            tween(wrapper, 0.18, {Size = UDim2.new(1, 0, 0, open and openHeight() or ROW_H)})
        end
        function el:Open()
            setOpen(true)
        end
        function el:Close()
            setOpen(false)
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
        invertBtn.MouseButton1Click:Connect(function()
            el:Invert(false)
        end)
        if searchBox then
            local token = 0
            searchBox:GetPropertyChangedSignal("Text"):Connect(function()
                token = token + 1
                local my = token
                task.delay(0.12, function() -- espera a pessoa terminar de digitar
                    if my ~= token or not alive then
                        return
                    end
                    local q = foldText(searchBox.Text):match("^%s*(.-)%s*$")
                    if q ~= query then
                        query = q
                        rebuildView()
                        refreshHeader(lastCommitted)
                    end
                end)
            end)
        end

        -- valor inicial (Default/Selected) e padrão para "restaurar"
        local initial = opts2.Default or opts2.Selected or {}
        for _, name in ipairs(valuesToList(initial)) do
            if #options == 0 or optionSet[name] then
                selAdd(name)
            end
        end
        el.Default = copy(selectedList())
        if ordered then
            rebuildOrderIdx()
        end
        applyLayout()
        lastCommitted = selectedList()
        refreshHeader(lastCommitted)
        if opts2.Source then
            table.insert(multiSources, el)
        end
        return finalize(el, opts2)
    end

    function SectionMT:AddDropdown(opts2)
        opts2 = opts2 or {}
        if opts2.Multi == true then -- compatível: Get/Set/Refresh/Callback iguais, agora virtualizado e com pesquisa
            local o = {}
            for k, v in pairs(opts2) do
                o[k] = v
            end
            o._compat = true
            return self:AddMultiDropdown(o)
        end
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

        if not o.Force then -- evita repetir a mesma mensagem em sequência (loops de aviso)
            local key = tostring(o.Title) .. "\0" .. tostring(o.Content)
            local now = os.clock()
            if notifySeen[key] and now - notifySeen[key] < 1.5 then
                return
            end
            notifySeen[key] = now
            if now - notifyPrune > 30 then
                notifyPrune = now
                for k, t in pairs(notifySeen) do
                    if now - t > 5 then
                        notifySeen[k] = nil
                    end
                end
            end
        end
        local live = {}
        for _, c in ipairs(notifHolder:GetChildren()) do
            if c:IsA("CanvasGroup") then
                live[#live + 1] = c
            end
        end
        table.sort(live, function(a, b)
            return a.LayoutOrder < b.LayoutOrder
        end)
        while #live >= 5 do -- no máximo 5 na tela: a mais antiga sai
            table.remove(live, 1):Destroy()
        end

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
        errorSink = nil
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
        while alive do
            task.wait(0.5)
            local ok, err = pcall(pollFeatures)
            if not ok then
                warn("[NovaUI] status: " .. tostring(err))
            end
            local now = os.clock()
            for _, m in ipairs(multiSources) do
                local age = now - m:LastRefresh()
                if (m:IsOpen() and age >= 2) or (m.AutoRefresh and age >= m.AutoRefresh) then
                    pcall(m.Refresh, m)
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
local tabRemote = Win:AddTab("⚡ Remote", {Columns = 1})
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

-- Lê caminhos escritos como CÓDIGO (o texto nunca é executado), por exemplo:
--   local Event = game:GetService("Players").LocalPlayer.Character.DefaultSlap.Event
--   game:GetService("Players").LocalPlayer.Character.DefaultSlap.Event
-- Aceita "local X =", ponto e vírgula, ["Nome"], :WaitForChild("Nome"), :FindFirstChild("Nome")
-- e ignora um :FireServer(...) / :InvokeServer(...) no final.
-- Devolve {segs = {...a partir do game...}, method = ...} ou nil quando é um caminho comum.
local function parsePathExpr(text)
    text = tostring(text or "")
    if not text:find("[%(%[:=\"']") then
        return nil
    end
    local line
    for l in text:gmatch("[^\r\n]+") do
        local cleaned = (l:gsub("%-%-.*$", ""))
        local low = cleaned:lower()
        if low:find("game", 1, true) or low:find("workspace", 1, true) then
            line = cleaned
            break
        end
    end
    if not line then
        return nil
    end
    line = trim(line)
    line = (line:gsub("^local%s+[%a_][%w_]*%s*=%s*", ""))
    line = (line:gsub("^[%a_][%w_]*%s*=%s*", ""))
    local n, pos = #line, 1
    local function skipSpace()
        pos = line:find("%S", pos) or (n + 1)
    end
    skipSpace()
    local root, after = line:match("^([%a_][%w_]*)()", pos)
    if not root then
        return nil
    end
    local lroot = root:lower()
    local segs = {}
    if lroot == "workspace" then
        segs[1] = "Workspace"
    elseif lroot ~= "game" then
        return nil
    end
    pos = after
    local method
    while true do
        skipSpace()
        if pos > n then
            break
        end
        local c = line:sub(pos, pos)
        if c == ";" then
            break
        elseif c == "." then
            local name, nxt = line:match("^%.%s*([%a_][%w_]*)()", pos)
            if not name then
                return nil
            end
            segs[#segs + 1] = name
            pos = nxt
        elseif c == "[" then
            local _, name, nxt = line:match("^%[%s*([\"'])(.-)%1%s*%]()", pos)
            if not name then
                return nil
            end
            segs[#segs + 1] = name
            pos = nxt
        elseif c == ":" then
            local name, nxt = line:match("^:%s*([%a_][%w_]*)()", pos)
            if not name then
                return nil
            end
            pos = nxt
            skipSpace()
            if name == "FireServer" or name == "InvokeServer" then
                method = name
                break
            end
            local _, arg, nxt2 = line:match("^%(%s*([\"'])(.-)%1()", pos)
            if not arg then
                return nil
            end
            local close = line:find(")", nxt2, true)
            if not close or not line:sub(nxt2, close - 1):match("^[%s,%d%.]*$") then
                return nil
            end
            if name == "GetService" and #segs == 0 then
                segs[1] = arg
            elseif name == "WaitForChild" or name == "FindFirstChild" then
                segs[#segs + 1] = arg
            else
                return nil
            end
            pos = close + 1
        else
            return nil
        end
    end
    if #segs == 0 then
        return nil
    end
    return {segs = segs, method = method}
end

-- "Pasta.Sub.Pasta" ou "Workspace/Pasta"; sem prefixo, parte do Workspace.
-- Também entende código: game:GetService("Players").LocalPlayer.Character.Tool.Event
local function resolvePath(text)
    text = trim(text)
    if text == "" then
        return nil
    end
    local parts, cur, start = {}, Workspace, 1
    local px = parsePathExpr(text)
    if px then
        parts, cur = px.segs, game
    else
        for p in text:gmatch("[^%./\\]+") do
            table.insert(parts, p)
        end
        local first = parts[1] and parts[1]:lower()
        if first == "game" then
            cur, start = game, 2
        elseif first == "workspace" then
            start = 2
        end
    end
    for i = start, #parts do
        local nxt = cur:FindFirstChild(parts[i])
        if not nxt and parts[i] == "LocalPlayer" and cur == Players then
            nxt = LocalPlayer
        end
        if not nxt and cur == game then
            local ok, svc = pcall(game.GetService, game, parts[i])
            nxt = ok and svc or nil
        end
        -- Character não é "filho" do Player: é uma propriedade (Players.LocalPlayer.Character)
        if not nxt and (parts[i] == "Character" or parts[i] == "PrimaryPart" or parts[i] == "Parent") then
            local okp, v = pcall(function()
                return cur[parts[i]]
            end)
            if okp and typeof(v) == "Instance" then
                nxt = v
            end
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

-- um item por NPC (nomes repetidos ficam repetidos): o MultiDropdown agrupa e mostra "Nome ×7"
local function npcNames(dirText)
    local out = {}
    for _, m in ipairs(getNPCs(dirText)) do
        out[#out + 1] = m.Name
    end
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

--// ---------------- FX Clean Global (aba Visual) ----------------
-- Desliga (sem apagar) partículas, trails, beams, fumaça, fogo, luzes e pós-processamento.
-- Ao desligar o toggle, tudo volta ao valor original. "ballhit" e "slasheffect" são apagados de vez.
do
    local fxs = tabVisual:AddSection("✨ FX Clean")
    local fxOn = false
    local saved = setmetatable({}, {__mode = "k"}) -- instância -> valores originais
    local savedCount = 0
    local origQuality = nil
    local fxRun = 0
    local fxConn1, fxConn2

    local DEL_NAMES = {"ballhit", "slasheffect"}
    local FX_CLASS = {
        ParticleEmitter = {Enabled = false, Lifetime = NumberRange.new(0)},
        Trail = {Enabled = false},
        Beam = {Enabled = false},
        Smoke = {Enabled = false},
        Fire = {Enabled = false},
        Sparkles = {Enabled = false},
        Explosion = {Visible = false},
        PointLight = {Enabled = false},
        SpotLight = {Enabled = false},
        SurfaceLight = {Enabled = false},
        BloomEffect = {Enabled = false},
        BlurEffect = {Enabled = false},
        SunRaysEffect = {Enabled = false},
        DepthOfFieldEffect = {Enabled = false},
        ColorCorrectionEffect = {Enabled = false},
    }

    local function fxHit(inst)
        if not fxOn or not inst or not inst.Parent then
            return
        end
        local okN, lname = pcall(function()
            return inst.Name:lower()
        end)
        if okN and lname ~= "" then
            for _, n in ipairs(DEL_NAMES) do
                if lname == n or lname:find(n, 1, true) then
                    if inst:IsDescendantOf(Workspace) then
                        pcall(function()
                            inst:Destroy()
                        end)
                    end
                    return
                end
            end
        end
        local props = FX_CLASS[inst.ClassName]
        if not props or saved[inst] then
            return
        end
        local old = {}
        for k, v in pairs(props) do
            local ok, cur = pcall(function()
                return inst[k]
            end)
            if ok then
                old[k] = cur
                pcall(function()
                    inst[k] = v
                end)
            end
        end
        saved[inst] = old
        savedCount = savedCount + 1
    end

    local function fxApply()
        fxRun = fxRun + 1
        local myRun = fxRun
        if origQuality == nil then
            pcall(function()
                local r = settings().Rendering
                origQuality = r.QualityLevel
                r.QualityLevel = Enum.QualityLevel.Level01
            end)
        end
        local n = 0
        for _, root in ipairs({Workspace, Lighting}) do
            local okD, list = pcall(root.GetDescendants, root)
            if okD then
                for _, d in ipairs(list) do
                    if not fxOn or myRun ~= fxRun then
                        return
                    end
                    fxHit(d)
                    n = n + 1
                    if n % 400 == 0 then
                        task.wait() -- varredura em lotes, sem travar o jogo
                    end
                end
            end
        end
    end

    local function fxRestore()
        fxRun = fxRun + 1 -- cancela varredura em andamento
        for inst, old in pairs(saved) do
            if inst and inst.Parent then
                for k, v in pairs(old) do
                    pcall(function()
                        inst[k] = v
                    end)
                end
            end
            saved[inst] = nil
        end
        savedCount = 0
        if origQuality ~= nil then
            pcall(function()
                settings().Rendering.QualityLevel = origQuality
            end)
            origQuality = nil
        end
    end

    local function fxSet(v)
        fxOn = v and true or false
        if fxOn then
            task.spawn(fxApply)
        else
            task.spawn(fxRestore)
        end
    end

    fxs:AddToggle({
        Name = "FX Clean Global", Flag = "fxclean", Default = false,
        Callback = function(v)
            fxSet(v)
        end,
    })
    fxs:AddLabel("Desliga partículas, trails, beams, fumaça, fogo, luzes e efeitos de tela (bloom, blur...) e baixa a qualidade gráfica. Ao desligar, tudo volta ao normal.")

    -- objetos novos também são limpos enquanto estiver ligado
    fxConn1 = Win:Track(Workspace.DescendantAdded:Connect(function(inst)
        if fxOn then
            task.defer(fxHit, inst)
        end
    end))
    fxConn2 = Win:Track(Lighting.DescendantAdded:Connect(function(inst)
        if fxOn then
            task.defer(fxHit, inst)
        end
    end))

    -- batimento para o Painel de Status
    local acc = 0
    connect(RunService.Heartbeat, function(dt)
        acc = acc + dt
        if acc < 1 then
            return
        end
        acc = 0
        if fxOn then
            Mon.tick("fxclean", savedCount .. " efeito(s) desligado(s)")
        end
    end, {"fxclean"})

    Win:OnDestroy(function()
        fxOn = false
        F.fxclean = false
        pcall(fxRestore)
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

-- avoid (opcional): evita escolher de novo o alvo anterior quando existe outro candidato
local function nearest(models, from, avoid)
    local best, bestD, fallback
    for _, m in ipairs(models) do
        local r = getRoot(m)
        if r and isAlive(m) then
            if m == avoid then
                fallback = m
            else
                local d = (r.Position - from).Magnitude
                if not bestD or d < bestD then
                    best, bestD = m, d
                end
            end
        end
    end
    return best or fallback
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
            target = nearest(cands, myRoot.Position, target)
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
        local out = {}
        if dir then
            for _, it in ipairs(dir:GetChildren()) do
                if it:IsA("BasePart") or it:IsA("Model") then
                    out[#out + 1] = it.Name -- repetidos são agrupados pelo MultiDropdown
                end
            end
        end
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
        local out = {}
        for _, o in ipairs(objectList(false)) do
            out[#out + 1] = o.Name -- repetidos são agrupados pelo MultiDropdown
        end
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

    local AUTOCLICK_NAME = "🎯 Auto Click (ponto na tela)"
    local actionNames = {
        "Coletar itens do diretório", "Teleportar p/ objeto selecionado", "Interagir com objetos",
        "Pular", "Teleportar p/ jogador mais próximo", AUTOCLICK_NAME,
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
            if f.num then
                used[f.num] = true
            end
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


    --// ---- Auto Click flutuante: toque virtual num ponto travado da tela ----
    local GuiService = game:GetService("GuiService")
    local VIM
    pcall(function()
        VIM = game:GetService("VirtualInputManager")
    end)
    -- No celular, clique de mouse virtual faz o Roblox trocar para o modo teclado/mouse e
    -- esconder o joystick; por isso lá o clique é enviado como TOQUE virtual.
    local IS_MOBILE = UserInputService.TouchEnabled and not UserInputService.KeyboardEnabled
    local touchWorks = true -- vira false se o executor não suportar SendTouchEvent
    local AUTOCLICK_Y_OFFSET = 0 -- ajuste fino vertical se o clique cair fora da bolinha
    local DOT_COLORS = {
        Color3.fromRGB(255, 60, 60), Color3.fromRGB(0, 140, 255), Color3.fromRGB(0, 200, 90),
        Color3.fromRGB(255, 200, 0), Color3.fromRGB(180, 90, 255),
    }

    local function virtualTap(x, y, slot)
        if IS_MOBILE and touchWorks then
            local tid = 100 + slot -- id diferente do dedo real (joystick)
            local ok = pcall(function()
                VIM:SendTouchEvent(tid, 0, x, y) -- Begin
                VIM:SendTouchEvent(tid, 2, x, y) -- End
            end)
            if ok then
                return true
            end
            touchWorks = false -- cai para o clique de mouse abaixo
        end
        return pcall(function()
            VIM:SendMouseButtonEvent(x, y, 0, true, game, 0)
            VIM:SendMouseButtonEvent(x, y, 0, false, game, 0)
        end)
    end

    local function createAutoClickFloat(label)
        if countFloats() >= MAX_FLOATS then
            notify("Botões de ação", "Limite de " .. MAX_FLOATS .. " botões atingido.", "warning")
            return
        end
        if not VIM then
            notify("Auto Click", "Seu executor não liberou o VirtualInputManager.", "error")
            return
        end
        counter = counter + 1
        local id = counter

        -- número do Auto Click: menor número livre
        local used = {}
        for _, f in pairs(floats) do
            if f.anum then
                used[f.anum] = true
            end
        end
        local anum = 1
        while used[anum] do
            anum = anum + 1
        end
        label = (label and label ~= "") and label or ("Auto Click " .. anum)

        local interval = 0.1 -- segundos entre cliques (0 = a cada frame)
        local target = nil -- Vector2 em coordenadas de tela
        local running = false
        local runToken = 0
        local capture, captureConn = nil, nil
        local EXPANDED_H = 120

        local card = new("Frame", {
            Name = "RN_AutoClick_" .. id, Size = UDim2.fromOffset(190, 46), BackgroundColor3 = Theme.Surface,
            BorderSizePixel = 0, Active = true, ZIndex = 6,
        }, Root)
        corner(card, 10)
        stroke(card, Theme.Accent, 1.5)

        local main = new("TextButton", {
            Name = "Main", Position = UDim2.fromOffset(6, 7), Size = UDim2.fromOffset(110, 32), BackgroundColor3 = Theme.Element,
            AutoButtonColor = false, Text = "▶ " .. label, Font = FONT_BOLD, TextSize = 12, TextColor3 = Theme.Text,
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

        -- painel: SET ALVO / DELETE / intervalo
        local panel = new("Frame", {
            Name = "Settings", Position = UDim2.fromOffset(6, 46), Size = UDim2.fromOffset(178, 70),
            BackgroundTransparency = 1, Visible = false, ZIndex = 7,
        }, card)
        local setBtn = new("TextButton", {
            Name = "Set", Position = UDim2.fromOffset(0, 3), Size = UDim2.fromOffset(84, 28), BackgroundColor3 = Theme.Element,
            Text = "🎯 SET ALVO", Font = FONT_BOLD, TextSize = 11, TextColor3 = Theme.Text, ZIndex = 8,
        }, panel)
        corner(setBtn, 6)
        local delBtn = new("TextButton", {
            Name = "Delete", Position = UDim2.fromOffset(90, 3), Size = UDim2.fromOffset(84, 28), BackgroundColor3 = Color3.fromRGB(150, 50, 60),
            Text = "🗑 DELETE", Font = FONT_BOLD, TextSize = 11, TextColor3 = Color3.new(1, 1, 1), ZIndex = 8,
        }, panel)
        corner(delBtn, 6)
        makeLabel(panel, "Intervalo", {Position = UDim2.fromOffset(0, 37), Size = UDim2.fromOffset(84, 28), ZIndex = 8, TextColor3 = Theme.SubText, TextSize = 12})
        local box = new("TextBox", {
            Name = "Interval", Position = UDim2.fromOffset(88, 37), Size = UDim2.fromOffset(62, 28), BackgroundColor3 = Theme.Background,
            Text = tostring(interval), ClearTextOnFocus = false, Font = FONT, TextSize = 12, TextColor3 = Theme.Text, ZIndex = 8,
        }, panel)
        corner(box, 6)
        makeLabel(panel, "s", {Position = UDim2.fromOffset(154, 37), Size = UDim2.fromOffset(20, 28), ZIndex = 8, TextColor3 = Theme.SubText})

        -- bolinha do alvo (não intercepta toques: o clique virtual passa por ela)
        local dot = new("Frame", {
            Name = "RN_AutoClickDot_" .. id, Size = UDim2.fromOffset(18, 18), AnchorPoint = Vector2.new(0.5, 0.5),
            BackgroundColor3 = DOT_COLORS[(anum - 1) % #DOT_COLORS + 1], BorderSizePixel = 0, Visible = false, Active = false, ZIndex = 9,
        }, Root)
        corner(dot, 9)
        stroke(dot, Color3.new(1, 1, 1), 1.5)
        makeLabel(dot, tostring(anum), {
            Size = UDim2.fromScale(1, 1), ZIndex = 10, TextSize = 10, Font = FONT_BOLD,
            TextXAlignment = Enum.TextXAlignment.Center, TextColor3 = Color3.new(1, 1, 1),
        })

        local function refreshSetBtn()
            if capture then
                setBtn.Text = "✖ CANCELAR"
                setBtn.BackgroundColor3 = Color3.fromRGB(150, 50, 60)
            elseif target then
                setBtn.Text = "✅ TRAVADO"
                setBtn.BackgroundColor3 = Theme.Element
            else
                setBtn.Text = "🎯 SET ALVO"
                setBtn.BackgroundColor3 = Theme.Element
            end
        end

        local function endCapture()
            if captureConn then
                captureConn:Disconnect()
                captureConn = nil
            end
            if capture then
                pcall(function()
                    capture:Destroy()
                end)
                capture = nil
            end
            refreshSetBtn()
        end

        local function setRunning(on)
            if on then
                if running then
                    return
                end
                if capture then
                    endCapture()
                end
                if not target then
                    notify("Auto Click", "Trave um ponto primeiro: ⚙️ → SET ALVO.", "warning")
                    panel.Visible = true
                    card.Size = UDim2.fromOffset(190, EXPANDED_H)
                    return
                end
                running = true
                runToken = runToken + 1
                local my = runToken
                main.Text = "■ " .. label
                main.BackgroundColor3 = Theme.Accent
                task.spawn(function()
                    while running and runToken == my and Win:IsAlive() do
                        local p = target
                        if not p then
                            break
                        end
                        virtualTap(p.X, p.Y + AUTOCLICK_Y_OFFSET, anum)
                        if interval > 0 then
                            task.wait(interval)
                        else
                            task.wait() -- 0 = a cada frame
                        end
                    end
                end)
            else
                running = false
                runToken = runToken + 1
                main.Text = "▶ " .. label
                main.BackgroundColor3 = Theme.Element
            end
        end

        -- Modo SET ALVO: uma camada cobre a tela e o PRÓXIMO toque (mesmo em cima de botão do jogo) vira o alvo
        local function beginCapture()
            endCapture()
            capture = new("TextButton", {
                Name = "RN_AutoClickCapture", Size = UDim2.fromScale(1, 1), BackgroundColor3 = Color3.new(0, 0, 0),
                BackgroundTransparency = 0.7, AutoButtonColor = false, Active = true, ZIndex = 3,
                Text = "Toque no ponto onde o clique deve acontecer\n(pode ser em cima de qualquer botão)",
                Font = FONT_BOLD, TextSize = 16, TextWrapped = true, TextColor3 = Color3.new(1, 1, 1),
            }, Root)
            -- escuta o toque ignorando "processed": botões do jogo não impedem de travar o ponto
            captureConn = UserInputService.InputBegan:Connect(function(input)
                local t = input.UserInputType
                if t ~= Enum.UserInputType.MouseButton1 and t ~= Enum.UserInputType.Touch then
                    return
                end
                if not (card and card.Parent) then
                    endCapture() -- interface foi fechada
                    return
                end
                local p = Vector2.new(input.Position.X, input.Position.Y + GuiService:GetGuiInset().Y)
                -- toque em cima de um flutuante do RN TEAM não conta (permite usar CANCELAR)
                for _, f in pairs(floats) do
                    local c = f.card
                    if c and c.Parent then
                        local ap, sz = c.AbsolutePosition, c.AbsoluteSize
                        if p.X >= ap.X and p.X <= ap.X + sz.X and p.Y >= ap.Y and p.Y <= ap.Y + sz.Y then
                            return
                        end
                    end
                end
                target = p
                dot.Position = UDim2.fromOffset(p.X, p.Y)
                dot.Visible = true
                endCapture()
            end)
            refreshSetBtn()
        end

        setBtn.MouseButton1Click:Connect(function()
            if capture then
                endCapture() -- cancelar
            else
                setRunning(false) -- o clique automático não pode rodar enquanto escolhe o ponto
                beginCapture()
            end
        end)
        delBtn.MouseButton1Click:Connect(function()
            setRunning(false)
            endCapture()
            target = nil
            dot.Visible = false
            refreshSetBtn()
        end)
        box.FocusLost:Connect(function()
            local n = tonumber(box.Text)
            if n then
                interval = math.min(n, 3600) -- 0 ou negativo = a cada frame
            end
            box.Text = tostring(interval) -- valor inválido volta ao anterior
        end)
        cfg.MouseButton1Click:Connect(function()
            panel.Visible = not panel.Visible
            card.Size = panel.Visible and UDim2.fromOffset(190, EXPANDED_H) or UDim2.fromOffset(190, 46)
        end)

        local function cleanup()
            setRunning(false)
            endCapture()
            pcall(function()
                dot:Destroy()
            end)
        end
        close.MouseButton1Click:Connect(function()
            cleanup()
            floats[id] = nil
            card:Destroy()
        end)

        -- toque no botão principal liga/desliga; arrastar só move com o menu aberto (Auto-Lock)
        local pos = {x = Win._viewport().X * 0.38, y = 8}
        pos.x, pos.y = Win._place(card, pos.x, pos.y, Vector2.new(190, 46))
        Win._makeDraggable(main, card, pos, function()
            return card.AbsoluteSize
        end, function()
            setRunning(not running)
        end, function()
            return isDraggingEnabled
        end)
        floats[id] = {card = card, loopKey = "float_" .. id, anum = anum, cleanup = cleanup}
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
            if action == AUTOCLICK_NAME then
                createAutoClickFloat(label ~= "" and label or nil)
            else
                createFloatButton(actionFns[action], label ~= "" and label or nil)
            end
        end
    end})
    s:AddButton({Name = "Remover todos os botões", Callback = function()
        for id, f in pairs(floats) do
            stopLoop(f.loopKey)
            if f.cleanup then
                pcall(f.cleanup)
            end
            pcall(function()
                f.card:Destroy()
            end)
            floats[id] = nil
        end
    end})
    s:AddLabel("Com o menu fechado os botões ficam travados (só clicam). Abra o menu para reposicioná-los.")
    s:AddLabel("🎯 Auto Click: crie o botão, toque em ⚙️ → SET ALVO e toque no ponto da tela (pode ser em cima de botão do jogo). Depois toque no botão para ligar/desligar. No celular, escolha um ponto do lado direito para não pegar o joystick.")
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
--//  GRAVADOR DE ROTA v2 (aba Farm)
--//  * grava posição + orientação completa (inclui inclinação) com tempo, a 30 Hz
--//  * comprime trechos parados (sem perder o tempo que você ficou parado)
--//  * replay interpolado fiel ao tempo original, velocidade 0.5x a 8x
--//  * pausa/retoma (F3), progresso em tempo real e trava de movimento
--//  * rotas antigas (só pontos) são convertidas automaticamente
--// ============================================================
do
    local CFG = {
        RECORD_INTERVAL = 1 / 30, -- 30 Hz em vez de todo frame (economiza memória)
        MAX_RECORD_SECONDS = 300, -- limite de segurança (5 min)
        IDLE_POS_EPS = 0.02, -- studs; abaixo disso considera "parado"
        IDLE_ROT_EPS = 0.01, -- radianos; abaixo disso considera "sem giro"
        ROUTE_COUNT = 5,
        LEGACY_SPEED = 16, -- studs/s usados para dar tempo às rotas antigas
    }
    local STRIDE = 7 -- t, x, y, z, rx, ry, rz (Euler YXZ)
    local SPEED_OPTIONS = {"0.5x", "1x", "1.5x", "2x", "4x", "8x"}
    local LOCK_STATES = {
        Enum.HumanoidStateType.Running,
        Enum.HumanoidStateType.RunningNoPhysics,
        Enum.HumanoidStateType.Jumping,
        Enum.HumanoidStateType.Freefall,
        Enum.HumanoidStateType.Landed,
        Enum.HumanoidStateType.FallingDown,
        Enum.HumanoidStateType.Climbing,
        Enum.HumanoidStateType.Swimming,
    }

    local function rnd(x, m)
        return math.floor(x * m + 0.5) / m
    end

    -- rota = {v = 2, d = {t1,x1,y1,z1,rx1,ry1,rz1, t2,...}}; entra no RN_TEAM_SAVE.json
    local function newRoute()
        return {v = 2, d = {}}
    end
    local function sampleCount(r)
        return math.floor(#r.d / STRIDE)
    end
    local function routeDuration(r)
        local n = sampleCount(r)
        if n == 0 then
            return 0
        end
        return r.d[(n - 1) * STRIDE + 1]
    end
    local function routeLength(r)
        local d, len = r.d, 0
        for i = 1 + STRIDE, #d, STRIDE do
            len = len + (Vector3.new(d[i + 1], d[i + 2], d[i + 3]) - Vector3.new(d[i - STRIDE + 1], d[i - STRIDE + 2], d[i - STRIDE + 3])).Magnitude
        end
        return len
    end

    local function pushSample(d, t, cf)
        local rx, ry, rz = cf:ToEulerAnglesYXZ()
        local p = cf.Position
        local n = #d
        d[n + 1], d[n + 2], d[n + 3], d[n + 4] = rnd(t, 1000), rnd(p.X, 100), rnd(p.Y, 100), rnd(p.Z, 100)
        d[n + 5], d[n + 6], d[n + 7] = rnd(rx, 1000), rnd(ry, 1000), rnd(rz, 1000)
    end

    -- rota antiga {x,y,z,...}: ganha tempo (16 studs/s) e olha na direção do caminho
    local function convertLegacy(flat)
        local pts = {}
        for i = 1, #flat - 2, 3 do
            pts[#pts + 1] = Vector3.new(flat[i], flat[i + 1], flat[i + 2])
        end
        local r = newRoute()
        if #pts < 2 then
            return r
        end
        local t, look = 0, CFrame.new()
        for i, p in ipairs(pts) do
            if i > 1 then
                t = t + (p - pts[i - 1]).Magnitude / CFG.LEGACY_SPEED
            end
            local dir = pts[i + 1] and (pts[i + 1] - p) or (p - pts[i - 1])
            local flatDir = Vector3.new(dir.X, 0, dir.Z)
            if flatDir.Magnitude > 0.05 then
                look = CFrame.lookAt(Vector3.zero, flatDir)
            end
            pushSample(r.d, t, CFrame.new(p) * look)
        end
        return r
    end

    local function loadRoute(src)
        if type(src) ~= "table" then
            return newRoute()
        end
        if src.v == 2 and type(src.d) == "table" then
            local d = {}
            for _, v in ipairs(src.d) do
                if type(v) ~= "number" then
                    return newRoute()
                end
                d[#d + 1] = v
            end
            if #d % STRIDE ~= 0 then
                return newRoute()
            end
            return {v = 2, d = d}
        end
        local flat = {}
        for _, v in ipairs(src) do
            if type(v) ~= "number" then
                return newRoute()
            end
            flat[#flat + 1] = v
        end
        if #flat % 3 ~= 0 then
            return newRoute()
        end
        return convertLegacy(flat)
    end

    local routes = {}
    local savedRoutes = Win.Saved.routes
    for i = 1, CFG.ROUTE_COUNT do
        routes[i] = loadRoute(type(savedRoutes) == "table" and savedRoutes[i] or nil)
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

    -- ---------- reprodução: trilha pré-montada + interpolação ----------
    local function buildTrack(r)
        local times, cfs, d = {}, {}, r.d
        for i = 1, #d, STRIDE do
            times[#times + 1] = d[i]
            cfs[#cfs + 1] = CFrame.new(d[i + 1], d[i + 2], d[i + 3]) * CFrame.fromEulerAnglesYXZ(d[i + 4], d[i + 5], d[i + 6])
        end
        return {times = times, cfs = cfs, duration = times[#times] or 0}
    end

    local function findIndex(times, t) -- maior i com times[i] <= t (busca binária)
        local lo, hi = 1, #times
        if t <= times[lo] then
            return lo
        end
        if t >= times[hi] then
            return hi
        end
        while lo < hi - 1 do
            local mid = math.floor((lo + hi) / 2)
            if times[mid] <= t then
                lo = mid
            else
                hi = mid
            end
        end
        return lo
    end

    -- CFrame:Lerp interpola posição e faz slerp da orientação (preserva inclinação/giro)
    local function sampleAt(track, t)
        local times, cfs = track.times, track.cfs
        local i = findIndex(times, t)
        local j = math.min(i + 1, #times)
        local seg = times[j] - times[i]
        if seg <= 0 then
            return cfs[i]
        end
        return cfs[i]:Lerp(cfs[j], math.clamp((t - times[i]) / seg, 0, 1))
    end

    local function speedMult()
        return tonumber(tostring(F.route_mult or "1x"):match("[%d%.]+")) or 1
    end
    local function slotIndex()
        return tonumber(tostring(F.route_slot or "Rota 1"):match("%d+")) or 1
    end

    -- ---------- trava de movimento do Humanoid durante o replay ----------
    local function lockHum(hum)
        if not hum then
            return nil
        end
        local saved = {hum = hum, ws = hum.WalkSpeed, jp = hum.JumpPower, jh = hum.JumpHeight, ar = hum.AutoRotate}
        pcall(function()
            hum.WalkSpeed, hum.JumpPower, hum.JumpHeight, hum.AutoRotate = 0, 0, 0, false
            for _, st in ipairs(LOCK_STATES) do
                hum:SetStateEnabled(st, false)
            end
        end)
        return saved
    end
    local function unlockHum(saved)
        if not saved or not saved.hum or not saved.hum.Parent then
            return
        end
        local hum = saved.hum
        pcall(function()
            for _, st in ipairs(LOCK_STATES) do
                hum:SetStateEnabled(st, true)
            end
            hum.WalkSpeed, hum.JumpPower, hum.JumpHeight = saved.ws, saved.jp, saved.jh
            hum.AutoRotate = saved.ar ~= false
        end)
    end

    -- ---------- interface ----------
    local rs = tabFarm:AddSection("🛤️ Gravador de Rota")
    local infoLbl
    local rec, play = nil, nil

    local function refreshInfo()
        if not infoLbl then
            return
        end
        local n = slotIndex()
        local r = routes[n]
        local c = sampleCount(r)
        if c == 0 then
            infoLbl:Set("Rota " .. n .. ": vazia")
        else
            infoLbl:Set(string.format("Rota %d: %d amostras, %.1fs, cerca de %d studs", n, c, routeDuration(r), math.floor(routeLength(r) + 0.5)))
        end
    end

    local function finishRecording(r)
        if r.idleT then
            pushSample(r.d, r.idleT, r.lastCf) -- mantém o tempo parado no final
        end
        if #r.d < STRIDE * 2 then
            notify("Gravador", "Rota muito curta; nada foi salvo.", "warning")
            return
        end
        routes[r.slot] = {v = 2, d = r.d}
        local saved = Win:Save()
        refreshInfo()
        local msg = string.format("Rota %d: %d amostras (%.1fs)", r.slot, sampleCount(routes[r.slot]), routeDuration(routes[r.slot]))
        if saved then
            notify("Gravador", msg .. " salva.", "success")
        else
            notify("Gravador", msg .. " guardada só na memória (não foi possível gravar o arquivo).", "warning")
        end
    end

    rs:AddDropdown({
        Name = "Rota", Flag = "route_slot", Default = "Rota 1",
        Options = {"Rota 1", "Rota 2", "Rota 3", "Rota 4", "Rota 5"},
        Callback = function()
            if rec or play then
                notify("Gravador", "A troca vale para a próxima gravação/reprodução.", "info")
                return
            end
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
                local cf = root.CFrame
                rec = {slot = slotIndex(), d = {}, start = os.clock(), lastTick = 0, lastCf = cf, idleT = nil, root = root}
                pushSample(rec.d, 0, cf)
                notify("Gravador", "🔴 Gravando a Rota " .. rec.slot .. " (substitui a anterior). Desligue para salvar.", "info")
            else
                local r = rec
                rec = nil
                if r then
                    finishRecording(r)
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
                if sampleCount(r) < 2 then
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
                local track = buildTrack(r)
                local t0 = 0
                if F.route_nearest then
                    local best = math.huge
                    for i, cf in ipairs(track.cfs) do
                        local dd = (cf.Position - root.Position).Magnitude
                        if dd < best then
                            best, t0 = dd, track.times[i]
                        end
                    end
                end
                play = {slot = n, track = track, t = t0, root = root, lock = lockHum(getHum()), uiT = 0}
                notify("Gravador", string.format("▶ Reproduzindo a Rota %d (%.1fs) a %sx.", n, track.duration, tostring(speedMult())), "info")
            else
                local p = play
                play = nil
                if p then
                    unlockHum(p.lock)
                end
                Mover.release("route")
                if F.route_pause then
                    Win.Elements.route_pause:Set(false, true)
                end
                refreshInfo()
            end
        end,
    })
    rs:AddToggle({Name = "Pausar reprodução", Flag = "route_pause", Default = false, NoSave = true, Feature = false})
    rs:AddKeybind({
        Name = "Tecla pausar/retomar", Flag = "route_pause_key", Default = "F3",
        Callback = function()
            if play then
                Win.Elements.route_pause:Set(not F.route_pause, false)
            end
        end,
    })
    rs:AddDropdown({Name = "Velocidade do replay", Flag = "route_mult", Options = SPEED_OPTIONS, Default = "1x"})
    rs:AddToggle({Name = "Repetir em loop", Flag = "route_loop", Default = false, Feature = false})
    rs:AddToggle({Name = "Começar do ponto mais próximo", Flag = "route_nearest", Default = false, Feature = false})
    rs:AddButton({Name = "Apagar esta rota", Callback = function()
        local n = slotIndex()
        if (rec and rec.slot == n) or (play and play.slot == n) then
            notify("Gravador", "Pare a gravação/reprodução antes de apagar.", "warning")
            return
        end
        routes[n] = newRoute()
        local saved = Win:Save()
        refreshInfo()
        notify("Gravador", saved and ("Rota " .. n .. " apagada.") or ("Rota " .. n .. " apagada da memória (arquivo não gravado)."), saved and "success" or "warning")
    end})
    rs:AddLabel("O replay segue o tempo, a posição e a orientação gravados (atravessa paredes). Ficar parado não gasta memória.")

    -- ---------- gravação: 30 Hz + compressão de trechos parados ----------
    connect(RunService.Heartbeat, function()
        if not rec then
            return
        end
        local root = getRoot()
        if not root or root ~= rec.root or not isAlive(LocalPlayer.Character) then
            notify("Gravador", "Personagem morreu/resetou: gravação encerrada.", "warning")
            Win.Elements.route_rec:Set(false, false) -- salva o que já foi gravado
            return
        end
        local elapsed = os.clock() - rec.start
        if elapsed >= CFG.MAX_RECORD_SECONDS then
            Win:Log("WARNING", "Gravador: limite de " .. CFG.MAX_RECORD_SECONDS .. "s atingido; gravação encerrada")
            notify("Gravador", "Limite de " .. CFG.MAX_RECORD_SECONDS .. "s atingido; gravação encerrada.", "warning")
            Win.Elements.route_rec:Set(false, false)
            return
        end
        if elapsed - rec.lastTick < CFG.RECORD_INTERVAL then
            return
        end
        rec.lastTick = elapsed
        local cf = root.CFrame
        local moved = (cf.Position - rec.lastCf.Position).Magnitude > CFG.IDLE_POS_EPS
        if not moved then
            local dot = math.clamp(cf.LookVector:Dot(rec.lastCf.LookVector), -1, 1)
            moved = math.acos(dot) > CFG.IDLE_ROT_EPS
        end
        if moved then
            if rec.idleT then
                pushSample(rec.d, rec.idleT, rec.lastCf) -- "segura" a pose até o fim da parada
                rec.idleT = nil
            end
            pushSample(rec.d, elapsed, cf)
            rec.lastCf = cf
        else
            rec.idleT = elapsed
        end
        Mon.tick("rrec", string.format("🔴 %d amostra(s), %.1fs", math.floor(#rec.d / STRIDE), elapsed))
    end, "rrec")

    -- ---------- reprodução: tempo real x velocidade, com pausa e loop ----------
    connect(RunService.Heartbeat, function(dt)
        if not (F.route_play and play) then
            return
        end
        local root = getRoot()
        if not root or not isAlive(LocalPlayer.Character) then
            Mon.tick("rplay", "aguardando o personagem (respawn)", true)
            return
        end
        if root ~= play.root then -- respawn: retoma do mesmo instante da rota
            if not Mover.hold("route", root) then
                Mon.tick("rplay", "movimento ocupado por outro sistema", true)
                return
            end
            unlockHum(play.lock)
            play.root = root
            play.lock = lockHum(getHum())
        end
        local track = play.track
        local finished = false
        if not F.route_pause then
            play.t = play.t + dt * speedMult()
            if play.t >= track.duration then
                if F.route_loop and track.duration > 0 then
                    play.t = play.t % track.duration
                else
                    play.t = track.duration
                    finished = true
                end
            end
        end
        root.CFrame = sampleAt(track, play.t)
        root.AssemblyLinearVelocity = Vector3.zero
        root.AssemblyAngularVelocity = Vector3.zero

        local pct = track.duration > 0 and (play.t / track.duration) or 1
        local text = string.format("%s Rota %d: %.1fs / %.1fs (%d%%) • %sx", F.route_pause and "⏸" or "▶", play.slot, play.t, track.duration, math.floor(pct * 100 + 0.5), tostring(speedMult()))
        Mon.tick("rplay", text)
        play.uiT = play.uiT + dt
        if play.uiT >= 0.2 and infoLbl then -- progresso na interface ~5x por segundo
            play.uiT = 0
            infoLbl:Set(text)
        end
        if finished then
            Win.Elements.route_play:Set(false, false)
            notify("Gravador", "⏹ Rota concluída.", "success")
        end
    end, "rplay")

    Win:OnDestroy(function()
        local p = play
        rec, play = nil, nil
        if p then
            unlockHum(p.lock)
        end
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
    local RN_DEFAULT_URL = "https://raw.githubusercontent.com/RN-TEAM-2758/MENU-UNIVERSAL-RN/refs/heads/main/script.js"

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
--//  ⚡ EVENTO / REMOTE
--//  EVENTO → CONFIGURAÇÕES → SELEÇÃO DOS ALVOS → GERAÇÃO DOS ARGUMENTOS → EXECUÇÃO
--// ============================================================
do
    local MAX_FIRES_PER_SECOND, MAX_TARGETS, MAX_PENDING_INVOKES = 60, 100, 8
    local ARG_OPTIONS = {"Player", "Character", "HumanoidRootPart", "Position", "LookVector", "CFrame", "Vector3", "Nome", "Model", "Part", "Texto fixo", "Número fixo"}
    local TYPE_OPTIONS = {"Players", "NPCs", "Models", "Parts"}
    local MODES = {
        Players = {"Todos os jogadores", "Um jogador por vez", "Jogador selecionado", "Jogador mais próximo"},
        NPCs = {"Todos os NPCs", "Um NPC por vez", "NPC selecionado", "NPC mais próximo"},
        Models = {"Todos os Models", "Um Model por vez", "Model selecionado", "Model mais próximo"},
        Parts = {"Todas as Parts", "Uma Part por vez", "Part selecionada", "Part mais próxima"},
    }
    local function modeIndex(value, list)
        for i, v in ipairs(list) do
            if v == value then
                return i
            end
        end
        return 1
    end
    local function num(v)
        return tonumber(v) or 0
    end
    local EI = {} -- ponte entre o modo manual e o Event Intelligence (reset e "passar para o manual")

    local main = tabRemote:AddSection("⚡ Evento / Remote", true)
    main:AddLabel("Fluxo: EVENTO → CONFIGURAÇÕES → SELEÇÃO DOS ALVOS → GERAÇÃO DOS ARGUMENTOS → EXECUÇÃO. Os argumentos são montados a cada disparo, na ordem em que você os marcar. Limite de segurança: no máximo " .. MAX_FIRES_PER_SECOND .. " disparos por segundo.")

    -- todas as subseções começam recolhidas (o usuário abre só a que precisa)
    local sEvent = main:AddSubSection("🔌 EVENTO / REMOTE", false)
    local sTargets = main:AddSubSection("🎯 ALVOS", false)
    local sArgs = main:AddSubSection("🧩 ARGUMENTOS", false)
    local sPos = main:AddSubSection("📍 POSIÇÃO / DIREÇÃO", false)
    local sExec = main:AddSubSection("⚙️ EXECUÇÃO", false)

    --// ---------------------------------------------------------- 🔌 EVENTO / REMOTE
    local remoteCache = {path = nil, inst = nil}
    local function resolveRemote()
        local path = trim(F.ev_path)
        if path == "" then
            return nil, "informe o caminho do Remote"
        end
        local cached = remoteCache.inst
        if cached and remoteCache.path == path and cached.Parent then
            return cached
        end
        local inst = resolvePath(path) or resolvePath("game." .. path)
        if not inst then -- a Tool muda de Backpack para Character quando é equipada
            local alt = path
            if path:find(".Backpack.", 1, true) then
                alt = (path:gsub("%.Backpack%.", ".Character.", 1))
            elseif path:find(".Character.", 1, true) then
                alt = (path:gsub("%.Character%.", ".Backpack.", 1))
            end
            if alt ~= path then
                inst = resolvePath(alt) or resolvePath("game." .. alt)
            end
        end
        if inst and (inst:IsA("RemoteEvent") or inst:IsA("RemoteFunction")) then
            remoteCache = {path = path, inst = inst}
            return inst
        end
        if inst then
            return nil, "o objeto encontrado é " .. inst.ClassName .. ", não um Remote"
        end
        return nil, "Remote não encontrado"
    end

    local function scanRemotes()
        local out = {}
        local RS = game:GetService("ReplicatedStorage")
        local ok, list = pcall(RS.GetDescendants, RS)
        if ok then
            for _, d in ipairs(list) do
                if d:IsA("RemoteEvent") or d:IsA("RemoteFunction") then
                    out[#out + 1] = d:GetFullName()
                    if #out >= 1000 then
                        break
                    end
                end
            end
        end
        return out
    end

    sEvent:AddInput({
        Name = "Caminho do Remote", Flag = "ev_path", Default = "", Placeholder = "ReplicatedStorage.Remotes.Hit",
        -- aceita também código colado: local Event = game:GetService("Players").LocalPlayer.Character.Tool.Event
        Validate = function(raw)
            local px = parsePathExpr(raw)
            if px then
                return table.concat(px.segs, ".")
            end
            return trim(raw)
        end,
        Callback = function()
            remoteCache = {path = nil, inst = nil}
        end,
    })
    local remotesDd
    remotesDd = sEvent:AddMultiDropdown({
        Name = "Remotes encontrados", Source = scanRemotes, Placeholder = "Toque para escolher",
        Callback = function(_, info)
            local picked = info and info.added and info.added[1]
            if picked then
                Win.Elements.ev_path:Set(picked, false)
                remotesDd:Clear(true)
                notify("Remote", "Caminho preenchido: " .. picked, "info")
            end
        end,
    })
    sEvent:AddDropdown({Name = "Tipo de chamada", Flag = "ev_kind", Options = {"Auto", "FireServer", "InvokeServer"}, Default = "Auto"})
    sEvent:AddButton({Name = "Testar caminho", Callback = function()
        local r, err = resolveRemote()
        if r then
            notify("Remote", r.ClassName .. " encontrado: " .. r:GetFullName(), "success")
        else
            notify("Remote", tostring(err), "warning")
        end
    end})

    --// ---------------------------------------------------------- 🎯 ALVOS
    local typesDd = sTargets:AddMultiDropdown({
        Name = "Tipos de alvo", Flag = "ev_types", Options = TYPE_OPTIONS, Default = {"Players"},
    })
    sTargets:AddSlider({Name = "Distância máxima (0 = sem limite)", Flag = "ev_maxdist", Min = 0, Max = 2000, Default = 0, Step = 10})

    local sP = sTargets:AddSubSection("👤 Players", false)
    sP:AddDropdown({Name = "Modo", Flag = "ev_mode_players", Options = MODES.Players, Default = MODES.Players[1]})
    local playersDd = sP:AddMultiDropdown({
        Name = "Jogadores selecionados", Flag = "ev_players_sel",
        Source = function()
            local list = playerNameList()
            if F.ev_p_self then -- com "Incluir meu personagem" ligado, dá para escolher a si mesmo
                list[#list + 1] = LocalPlayer.Name
            end
            return list
        end,
    })
    sP:AddToggle({Name = "Somente vivos", Flag = "ev_p_alive", Default = true, Feature = false})
    sP:AddToggle({Name = "Ignorar aliados", Flag = "ev_p_ally", Default = true, Feature = false})
    sP:AddToggle({
        Name = "Incluir meu personagem", Flag = "ev_p_self", Default = false, Feature = false,
        Callback = function()
            pcall(playersDd.Refresh, playersDd)
        end,
    })

    local function childNames(dirText, filter)
        local out = {}
        local dir = resolvePath(dirText)
        if dir then
            for _, c in ipairs(dir:GetChildren()) do
                if filter(c) then
                    out[#out + 1] = c.Name
                end
            end
        end
        return out
    end
    local isModel = function(c)
        return c:IsA("Model") and not Players:GetPlayerFromCharacter(c)
    end
    local isPart = function(c)
        return c:IsA("BasePart")
    end

    local sN = sTargets:AddSubSection("🧟 NPCs", false)
    local npcDd
    sN:AddInput({
        Name = "Pasta de NPCs", Flag = "ev_npc_dir", Default = "", Placeholder = "Ex.: Workspace.NPCs",
        Callback = function()
            refreshMulti(npcDd, "NPC")
        end,
    })
    sN:AddDropdown({Name = "Modo", Flag = "ev_mode_npcs", Options = MODES.NPCs, Default = MODES.NPCs[1]})
    npcDd = sN:AddMultiDropdown({
        Name = "NPCs selecionados", Flag = "ev_npcs_sel",
        Source = function()
            return npcNames(F.ev_npc_dir or "")
        end,
    })
    sN:AddToggle({Name = "Somente vivos", Flag = "ev_n_alive", Default = true, Feature = false})

    local sM = sTargets:AddSubSection("📦 Models", false)
    local modelDd
    sM:AddInput({
        Name = "Pasta de Models", Flag = "ev_model_dir", Default = "", Placeholder = "Ex.: Workspace.Props",
        Callback = function()
            refreshMulti(modelDd, "Model")
        end,
    })
    sM:AddDropdown({Name = "Modo", Flag = "ev_mode_models", Options = MODES.Models, Default = MODES.Models[1]})
    modelDd = sM:AddMultiDropdown({
        Name = "Models selecionados", Flag = "ev_models_sel",
        Source = function()
            return childNames(F.ev_model_dir or "", isModel)
        end,
    })

    local sPt = sTargets:AddSubSection("🧱 Parts", false)
    local partDd
    sPt:AddInput({
        Name = "Pasta de Parts", Flag = "ev_part_dir", Default = "", Placeholder = "Ex.: Workspace.Drops",
        Callback = function()
            refreshMulti(partDd, "Part")
        end,
    })
    sPt:AddDropdown({Name = "Modo", Flag = "ev_mode_parts", Options = MODES.Parts, Default = MODES.Parts[1]})
    partDd = sPt:AddMultiDropdown({
        Name = "Parts selecionadas", Flag = "ev_parts_sel",
        Source = function()
            return childNames(F.ev_part_dir or "", isPart)
        end,
    })

    task.defer(function()
        npcDd:Refresh()
        modelDd:Refresh()
        partDd:Refresh()
        playersDd:Refresh()
    end)

    --// ---------------------------------------------------------- 🧩 ARGUMENTOS
    local argsDd = sArgs:AddMultiDropdown({
        Name = "Argumentos (na ordem marcada)", Flag = "ev_args", Options = ARG_OPTIONS, Ordered = true,
        Default = {"Character", "Position"}, Placeholder = "Sem argumentos",
    })
    sArgs:AddInput({Name = "Texto fixo", Flag = "ev_text", Default = "", Placeholder = 'Ex.: slash'})
    sArgs:AddInput({Name = "Número fixo", Flag = "ev_number", Default = 0, Numeric = true, Min = -1e9, Max = 1e9})
    sArgs:AddLabel("A ordem em que você marca vira a ordem dos argumentos (#1, #2...). Ex.: Character + Position envia (personagem do alvo, posição da parte de mira). Se um argumento não existir para um alvo, aquele alvo é pulado.")

    --// ---------------------------------------------------------- 📍 POSIÇÃO / DIREÇÃO
    sPos:AddDropdown({
        Name = "Parte de mira", Flag = "ev_aim_part", Options = {"HumanoidRootPart", "Head", "Torso", "UpperTorso"},
        Default = "HumanoidRootPart",
    })
    sPos:AddDropdown({
        Name = "Origem do argumento Position", Flag = "ev_pos_source",
        Options = {"Position do alvo", "Position do meu personagem", "Position fixa"}, Default = "Position do alvo",
    })
    sPos:AddDropdown({
        Name = "Origem do argumento CFrame", Flag = "ev_cf_source",
        Options = {"CFrame do alvo", "CFrame do meu personagem"}, Default = "CFrame do alvo",
    })
    sPos:AddDropdown({
        Name = "Origem do argumento LookVector", Flag = "ev_look_source",
        Options = {"LookVector do alvo", "LookVector do meu personagem", "Direção minha → alvo"}, Default = "LookVector do alvo",
    })
    sPos:AddDropdown({
        Name = "Origem do argumento Vector3", Flag = "ev_vec_source",
        Options = {"Fixo (X/Y/Z)", "Position do alvo", "Position do meu personagem", "LookVector do alvo", "LookVector do meu personagem", "Direção minha → alvo"},
        Default = "Fixo (X/Y/Z)",
    })
    sPos:AddInput({Name = "Position fixa X", Flag = "ev_fix_x", Default = 0, Numeric = true, Min = -1e6, Max = 1e6})
    sPos:AddInput({Name = "Position fixa Y", Flag = "ev_fix_y", Default = 0, Numeric = true, Min = -1e6, Max = 1e6})
    sPos:AddInput({Name = "Position fixa Z", Flag = "ev_fix_z", Default = 0, Numeric = true, Min = -1e6, Max = 1e6})
    sPos:AddInput({Name = "Vector3 personalizado X", Flag = "ev_vec_x", Default = 0, Numeric = true, Min = -1e6, Max = 1e6})
    sPos:AddInput({Name = "Vector3 personalizado Y", Flag = "ev_vec_y", Default = 0, Numeric = true, Min = -1e6, Max = 1e6})
    sPos:AddInput({Name = "Vector3 personalizado Z", Flag = "ev_vec_z", Default = 0, Numeric = true, Min = -1e6, Max = 1e6})

    --// ---------------------------------------------------------- seleção dos alvos
    local cursors = {Players = 0, NPCs = 0, Models = 0, Parts = 0}

    local function finishEntry(e)
        if e.kind == "Part" then
            e.aim = e.inst
        elseif e.model then
            e.aim = getPart(e.model, F.ev_aim_part or "HumanoidRootPart") or e.model.PrimaryPart
                or e.model:FindFirstChildWhichIsA("BasePart", true)
        end
        return e
    end

    local function entriesOf(typeName)
        local out = {}
        if typeName == "Players" then
            for _, p in ipairs(Players:GetPlayers()) do
                if (p == LocalPlayer and F.ev_p_self) or (p ~= LocalPlayer and not (F.ev_p_ally and isAlly(p))) then
                    if not F.ev_p_alive or isAlive(p.Character) then
                        out[#out + 1] = finishEntry({kind = "Player", inst = p, name = p.Name, player = p, model = p.Character})
                    end
                end
            end
        elseif typeName == "NPCs" then
            for _, m in ipairs(getNPCs(F.ev_npc_dir or "")) do
                if m.Parent and (not F.ev_n_alive or isAlive(m)) then
                    out[#out + 1] = finishEntry({kind = "NPC", inst = m, name = m.Name, model = m})
                end
            end
        elseif typeName == "Models" then
            local dir = resolvePath(F.ev_model_dir)
            for _, c in ipairs(dir and dir:GetChildren() or {}) do
                if isModel(c) then
                    out[#out + 1] = finishEntry({kind = "Model", inst = c, name = c.Name, model = c})
                end
            end
        else
            local dir = resolvePath(F.ev_part_dir)
            for _, c in ipairs(dir and dir:GetChildren() or {}) do
                if isPart(c) then
                    out[#out + 1] = finishEntry({kind = "Part", inst = c, name = c.Name, model = c:FindFirstAncestorOfClass("Model")})
                end
            end
        end
        -- distância máxima
        local maxd = tonumber(F.ev_maxdist) or 0
        local me = getRoot()
        if maxd > 0 then
            local kept = {}
            for _, e in ipairs(out) do
                if me and e.aim and (e.aim.Position - me.Position).Magnitude <= maxd then
                    kept[#kept + 1] = e
                end
            end
            out = kept
        end
        return out
    end

    local function pickByMode(typeName, entries, selectedDd)
        local idx = modeIndex(F["ev_mode_" .. typeName:lower()], MODES[typeName])
        local set = entries
        if idx == 3 then
            local want = toSet(selectedDd:Get())
            set = {}
            for _, e in ipairs(entries) do
                if want[e.name] then
                    set[#set + 1] = e
                end
            end
        end
        if #set == 0 then
            return {}
        end
        if idx == 4 then
            local me = getRoot()
            local best, bestD
            for _, e in ipairs(set) do
                local d = (me and e.aim) and (e.aim.Position - me.Position).Magnitude or math.huge
                if not bestD or d < bestD then
                    best, bestD = e, d
                end
            end
            return {best}
        elseif idx == 2 then
            local i = (cursors[typeName] % #set) + 1
            cursors[typeName] = cursors[typeName] + 1
            return {set[i]}
        end
        return set
    end

    local function collectTargets()
        local chosen = toSet(typesDd:Get())
        if next(chosen) == nil then
            return {{kind = "None", name = "(sem alvo)"}} -- só argumentos que não dependem de alvo
        end
        local out = {}
        local function add(list)
            for _, e in ipairs(list) do
                out[#out + 1] = e
            end
        end
        if chosen.Players then
            add(pickByMode("Players", entriesOf("Players"), playersDd))
        end
        if chosen.NPCs then
            add(pickByMode("NPCs", entriesOf("NPCs"), npcDd))
        end
        if chosen.Models then
            add(pickByMode("Models", entriesOf("Models"), modelDd))
        end
        if chosen.Parts then
            add(pickByMode("Parts", entriesOf("Parts"), partDd))
        end
        if #out > MAX_TARGETS then
            Win:Log("WARNING", "Evento: " .. #out .. " alvos; usando só os " .. MAX_TARGETS .. " primeiros")
            local cut = {}
            for i = 1, MAX_TARGETS do
                cut[i] = out[i]
            end
            out = cut
        end
        return out
    end

    --// ---------------------------------------------------------- geração dinâmica dos argumentos
    local function resolveArg(name, e)
        local me = getRoot()
        if name == "Player" then
            return e.player or (e.model and Players:GetPlayerFromCharacter(e.model)) or nil
        elseif name == "Character" or name == "Model" then
            return e.model
        elseif name == "HumanoidRootPart" then
            return e.model and (e.model:FindFirstChild("HumanoidRootPart") or e.model.PrimaryPart) or nil
        elseif name == "Part" then
            return e.aim
        elseif name == "Nome" then
            return e.name
        elseif name == "Texto fixo" then
            return tostring(F.ev_text or "")
        elseif name == "Número fixo" then
            return num(F.ev_number)
        elseif name == "Vector3" then
            local src = F.ev_vec_source
            if src == "Position do alvo" then
                return e.aim and e.aim.Position
            elseif src == "Position do meu personagem" then
                return me and me.Position
            elseif src == "LookVector do alvo" then
                return e.aim and e.aim.CFrame.LookVector
            elseif src == "LookVector do meu personagem" then
                return me and me.CFrame.LookVector
            elseif src == "Direção minha → alvo" then
                if me and e.aim then
                    local d = e.aim.Position - me.Position
                    if d.Magnitude > 1e-3 then
                        return d.Unit
                    end
                end
                return nil
            end
            return Vector3.new(num(F.ev_vec_x), num(F.ev_vec_y), num(F.ev_vec_z))
        elseif name == "Position" then
            local src = F.ev_pos_source
            if src == "Position do meu personagem" then
                return me and me.Position
            elseif src == "Position fixa" then
                return Vector3.new(num(F.ev_fix_x), num(F.ev_fix_y), num(F.ev_fix_z))
            end
            return e.aim and e.aim.Position
        elseif name == "LookVector" then
            local src = F.ev_look_source
            if src == "LookVector do meu personagem" then
                return me and me.CFrame.LookVector
            elseif src == "Direção minha → alvo" then
                if me and e.aim then
                    local d = e.aim.Position - me.Position
                    if d.Magnitude > 1e-3 then
                        return d.Unit
                    end
                end
                return nil
            end
            return e.aim and e.aim.CFrame.LookVector
        elseif name == "CFrame" then
            if F.ev_cf_source == "CFrame do meu personagem" then
                return me and me.CFrame
            end
            return e.aim and e.aim.CFrame
        end
        return nil
    end

    -- devolve (args, n) ou (nil, nomeDoArgumentoIndisponível)
    local function buildArgs(e)
        local order = F.ev_args or {}
        local args, n = {}, 0
        for _, name in ipairs(order) do
            local v = resolveArg(name, e)
            if v == nil then
                return nil, name
            end
            n = n + 1
            args[n] = v
        end
        return args, n
    end

    local function describe(v)
        local t = typeof(v)
        if t == "Instance" then
            return v.ClassName .. " '" .. v.Name .. "'"
        elseif t == "Vector3" then
            return string.format("Vector3(%.1f, %.1f, %.1f)", v.X, v.Y, v.Z)
        elseif t == "CFrame" then
            return string.format("CFrame(%.1f, %.1f, %.1f)", v.X, v.Y, v.Z)
        elseif t == "string" then
            return '"' .. v .. '"'
        end
        return tostring(v)
    end

    sArgs:AddButton({Name = "Pré-visualizar argumentos (1º alvo)", Callback = function()
        local list = collectTargets()
        local e = list[1]
        if not e then
            notify("Argumentos", "Nenhum alvo disponível com a configuração atual.", "warning")
            return
        end
        local args, n = buildArgs(e)
        if not args then
            notify("Argumentos", "O argumento '" .. tostring(n) .. "' não existe para o alvo '" .. e.name .. "'.", "warning")
            return
        end
        local parts = {}
        for i = 1, n do
            parts[i] = describe(args[i])
        end
        notify("Argumentos para " .. e.name, n == 0 and "(nenhum argumento)" or table.concat(parts, ", "), "info")
    end})

    --// ---------------------------------------------------------- ⚙️ EXECUÇÃO
    local MODE_OPTIONS = {"Executar uma vez", "Loop"}
    local PER_OPTIONS = {"Um alvo por vez", "Todos os alvos"}
    sExec:AddDropdown({Name = "Modo", Flag = "ev_mode", Options = MODE_OPTIONS, Default = "Executar uma vez"})
    sExec:AddDropdown({Name = "Alvos por execução", Flag = "ev_per", Options = PER_OPTIONS, Default = "Todos os alvos"})
    sExec:AddInput({Name = "Intervalo entre execuções (s)", Flag = "ev_interval", Default = 0.1, Numeric = true, Min = 0.03, Max = 3600})
    sExec:AddInput({Name = "Repetições (0 = infinito no loop)", Flag = "ev_reps", Default = 0, Numeric = true, Min = 0, Max = 1000000})
    sExec:AddInput({Name = "Atraso entre alvos (s)", Flag = "ev_delay", Default = 0, Numeric = true, Min = 0, Max = 60})

    local status = sExec:AddLabel("Parado.")
    local session = {stop = false}
    local lastFire, pending, perCycleCursor, lastStatus = 0, 0, 0, 0
    local totals = {fired = 0, skipped = 0, cycles = 0}

    local function setStatus(text, force)
        local now = os.clock()
        if force or now - lastStatus > 0.25 then
            lastStatus = now
            status:Set(text)
        end
    end

    local function rateGate() -- nunca passa de MAX_FIRES_PER_SECOND
        local gap = 1 / MAX_FIRES_PER_SECOND
        local wait = lastFire + gap - os.clock()
        if wait > 0 then
            task.wait(wait)
        end
        lastFire = os.clock()
    end

    local function sendTo(remote, args, n)
        local kind = F.ev_kind or "Auto"
        local isFn = remote:IsA("RemoteFunction")
        if kind == "FireServer" and isFn then
            return false, "o objeto é RemoteFunction; use InvokeServer ou Auto"
        end
        if kind == "InvokeServer" and not isFn then
            return false, "o objeto é RemoteEvent; use FireServer ou Auto"
        end
        if isFn then
            if pending >= MAX_PENDING_INVOKES then
                return false, "muitas chamadas InvokeServer aguardando resposta"
            end
            pending = pending + 1
            task.spawn(function()
                local ok, res = pcall(remote.InvokeServer, remote, table.unpack(args, 1, n))
                pending = pending - 1
                if ok then
                    Win:Log("INFO", "Retorno de " .. remote.Name, describe(res))
                else
                    Win:Log("ERROR", "InvokeServer falhou em " .. remote.Name, tostring(res))
                end
            end)
            return true
        end
        remote:FireServer(table.unpack(args, 1, n))
        return true
    end

    -- um ciclo: resolve o remote, seleciona os alvos, gera os argumentos de cada um e envia
    local function runCycle()
        local remote, err = resolveRemote()
        if not remote then
            Mon.tick("event", tostring(err), true)
            setStatus("Aguardando: " .. tostring(err), true)
            return 0, 0, tostring(err)
        end
        local targets = collectTargets()
        if #targets == 0 then
            Mon.tick("event", "nenhum alvo disponível", true)
            setStatus("Aguardando: nenhum alvo disponível", true)
            return 0, 0, "nenhum alvo"
        end
        local list = targets
        if F.ev_per == "Um alvo por vez" then
            list = {targets[(perCycleCursor % #targets) + 1]}
            perCycleCursor = perCycleCursor + 1
        end
        local fired, skipped, lastErr = 0, 0, nil
        for i, e in ipairs(list) do
            if session.stop then
                break
            end
            local args, n = buildArgs(e)
            if not args then
                skipped = skipped + 1
                Win:Log("WARNING", "Evento: argumento '" .. tostring(n) .. "' indisponível para '" .. tostring(e.name) .. "'; alvo pulado")
            else
                rateGate()
                local ok, e2 = pcall(sendTo, remote, args, n)
                if ok and e2 == true then
                    fired = fired + 1
                else
                    lastErr = tostring(ok and e2 or e2)
                    Win:Log("ERROR", "Evento: falha ao enviar para '" .. tostring(e.name) .. "'", lastErr)
                end
            end
            local d = num(F.ev_delay)
            if d > 0 and i < #list then
                task.wait(math.max(d, 0.03))
            end
        end
        totals.fired, totals.skipped, totals.cycles = totals.fired + fired, totals.skipped + skipped, totals.cycles + 1
        Mon.tick("event", string.format("%d disparo(s), %d pulado(s) no último ciclo", fired, skipped), fired == 0)
        setStatus(string.format("Ciclo %d: %d enviado(s), %d pulado(s). Total: %d enviado(s).", totals.cycles, fired, skipped, totals.fired))
        return fired, skipped, lastErr
    end

    local function runOnce()
        session.stop = false
        local reps = math.max(math.floor(num(F.ev_reps)), 1)
        local totalFired, totalSkipped = 0, 0
        for i = 1, reps do
            if session.stop then
                break
            end
            local f, s2, e = runCycle()
            totalFired, totalSkipped = totalFired + f, totalSkipped + s2
            if e and f == 0 and s2 == 0 then
                notify("Evento", "Nada foi enviado: " .. e, "warning")
                return
            end
            if i < reps then
                task.wait(math.max(num(F.ev_interval), 0.03))
            end
        end
        -- "enviado" = pedido entregue ao servidor; o efeito no jogo depende do servidor
        notify("Evento", string.format("%d disparo(s) enviado(s), %d alvo(s) pulado(s).", totalFired, totalSkipped), totalFired > 0 and "success" or "warning")
    end

    local loopCycles = 0
    local function loopStep()
        runCycle()
        loopCycles = loopCycles + 1
        local reps = math.floor(num(F.ev_reps))
        if reps > 0 and loopCycles >= reps then
            Win.Elements.ev_loop:Set(false, false)
            Win:Log("SUCCESS", "Evento: loop concluído (" .. loopCycles .. " ciclo(s))")
        end
    end

    sExec:AddToggle({
        Name = "Loop ativo", Flag = "ev_loop", Default = false, NoSave = true,
        Callback = function(on)
            if on then
                if F.ev_mode ~= "Loop" then
                    notify("Evento", "Mude o Modo para Loop para usar o loop.", "warning")
                    Win.Elements.ev_loop:Set(false, true)
                    return
                end
                local remote, err = resolveRemote()
                if not remote then
                    notify("Evento", tostring(err), "warning")
                    Win.Elements.ev_loop:Set(false, true)
                    return
                end
                session.stop = false
                loopCycles = 0
                startLoop("event", loopStep, function()
                    return math.max(num(F.ev_interval), 0.03)
                end)
            else
                session.stop = true
                stopLoop("event")
                setStatus("Parado.", true)
            end
        end,
    })
    sExec:AddButton({Name = "Executar", Callback = function()
        if F.ev_mode == "Loop" then
            Win.Elements.ev_loop:Set(not F.ev_loop, false)
        else
            task.spawn(runOnce)
        end
    end})
    sExec:AddButton({Name = "Parar tudo", Callback = function()
        session.stop = true
        if F.ev_loop then
            Win.Elements.ev_loop:Set(false, false)
        end
        stopLoop("event")
        setStatus("Parado.", true)
    end})


    --// ---------------------------------------------------------- ♻️ ZERAR ABA / 📥 RECEBER DO EVENT INTELLIGENCE
    local EV_DEFAULTS = {
        {"ev_path", ""}, {"ev_kind", "Auto"},
        {"ev_types", {"Players"}}, {"ev_maxdist", 0},
        {"ev_mode_players", MODES.Players[1]}, {"ev_players_sel", {}},
        {"ev_p_alive", true}, {"ev_p_ally", true}, {"ev_p_self", false},
        {"ev_npc_dir", ""}, {"ev_mode_npcs", MODES.NPCs[1]}, {"ev_npcs_sel", {}}, {"ev_n_alive", true},
        {"ev_model_dir", ""}, {"ev_mode_models", MODES.Models[1]}, {"ev_models_sel", {}},
        {"ev_part_dir", ""}, {"ev_mode_parts", MODES.Parts[1]}, {"ev_parts_sel", {}},
        {"ev_args", {"Character", "Position"}}, {"ev_text", ""}, {"ev_number", 0},
        {"ev_aim_part", "HumanoidRootPart"}, {"ev_pos_source", "Position do alvo"},
        {"ev_cf_source", "CFrame do alvo"}, {"ev_look_source", "LookVector do alvo"},
        {"ev_fix_x", 0}, {"ev_fix_y", 0}, {"ev_fix_z", 0},
        {"ev_vec_x", 0}, {"ev_vec_y", 0}, {"ev_vec_z", 0}, {"ev_vec_source", "Fixo (X/Y/Z)"},
        {"ev_mode", "Executar uma vez"}, {"ev_per", "Todos os alvos"},
        {"ev_interval", 0.1}, {"ev_reps", 0}, {"ev_delay", 0},
    }

    local function setEv(flag, value, silent)
        local el = Win.Elements[flag]
        if not el then
            return
        end
        local ok, err = pcall(el.Set, el, value, silent)
        if not ok then
            Win:Log("WARNING", "Evento: não foi possível ajustar '" .. flag .. "'", tostring(err))
        end
    end

    local function refreshAllTargets()
        for _, dd in ipairs({npcDd, modelDd, partDd, playersDd}) do
            pcall(dd.Refresh, dd)
        end
    end

    -- volta TODA a aba Evento ao estado original (manual + Event Intelligence)
    local function resetEventTab()
        session.stop = true
        if F.ev_loop then
            setEv("ev_loop", false, false)
        end
        stopLoop("event")
        for _, d in ipairs(EV_DEFAULTS) do
            setEv(d[1], d[2], true)
        end
        remoteCache = {path = nil, inst = nil}
        cursors.Players, cursors.NPCs, cursors.Models, cursors.Parts = 0, 0, 0, 0
        refreshAllTargets()
        setStatus("Parado.", true)
        if EI.reset then
            local ok, err = pcall(EI.reset)
            if not ok then
                Win:Log("ERROR", "Evento: falha ao zerar o Event Intelligence", tostring(err))
            end
        end
        setEv("ev_kind", "Auto", false) -- grava a configuração
        notify("Evento", "Aba Evento zerada: voltou ao original, como nova.", "success")
    end
    EI.resetTab = resetEventTab

    -- recebe do Event Intelligence: caminho, tipo de chamada, alvo e argumentos já montados
    function EI.toManual(spec)
        setEv("ev_path", spec.path, false)
        setEv("ev_kind", spec.kind or "Auto", false)
        local tg = spec.target
        setEv("ev_types", tg and {tg.type} or {}, false)
        if tg then
            if tg.type == "Players" then
                setEv("ev_p_self", tg.name == LocalPlayer.Name, false)
                setEv("ev_p_ally", false, false) -- senão um aliado seria descartado
                setEv("ev_mode_players", MODES.Players[3], false)
                pcall(playersDd.Refresh, playersDd)
                setEv("ev_players_sel", {tg.name}, false)
            elseif tg.type == "NPCs" then
                setEv("ev_npc_dir", tg.dir, true)
                pcall(npcDd.Refresh, npcDd)
                setEv("ev_mode_npcs", MODES.NPCs[3], false)
                setEv("ev_npcs_sel", {tg.name}, false)
            elseif tg.type == "Models" then
                setEv("ev_model_dir", tg.dir, true)
                pcall(modelDd.Refresh, modelDd)
                setEv("ev_mode_models", MODES.Models[3], false)
                setEv("ev_models_sel", {tg.name}, false)
            elseif tg.type == "Parts" then
                setEv("ev_part_dir", tg.dir, true)
                pcall(partDd.Refresh, partDd)
                setEv("ev_mode_parts", MODES.Parts[3], false)
                setEv("ev_parts_sel", {tg.name}, false)
            end
        end
        setEv("ev_args", spec.args or {}, false)
        if spec.text ~= nil then
            setEv("ev_text", spec.text, false)
        end
        if spec.number ~= nil then
            setEv("ev_number", spec.number, false)
        end
        if spec.aimPart then
            setEv("ev_aim_part", spec.aimPart, false)
        end
        if spec.posSource then
            setEv("ev_pos_source", spec.posSource, false)
        end
        if spec.lookSource then
            setEv("ev_look_source", spec.lookSource, false)
        end
        if spec.cfSource then
            setEv("ev_cf_source", spec.cfSource, false)
        end
        if spec.vecSource then
            setEv("ev_vec_source", spec.vecSource, false)
        end
        remoteCache = {path = nil, inst = nil}
    end

    sExec:AddButton({Name = "♻️ Zerar aba Evento (como nova)", Callback = function()
        task.spawn(resetEventTab)
    end})

    --// ============================================================
    --//  🧠 RN TEAM · EVENT INTELLIGENCE (opcional, independente do modo manual)
    --//  RSPY (texto colado) → ANÁLISE POR ARGUMENTO → CONTROLES → MONITORAMENTO → ENVIO MANUAL
    --//  Regra central: o que não é reconhecido com segurança é preservado, nunca alterado.
    --//  O texto colado NUNCA é executado: é lido por um analisador próprio (sem loadstring).
    --// ============================================================
    ;(function()
        local MAX_ARGS, MAX_PROFILES, MAX_QUEUE, MAX_SRC = 12, 20, 40, 30000
        local SAVE_FILE = "RN_TEAM_EI.json"
        local HOOK_KEY = "__RNTEAM_EI_HOOK"
        local KEYWORDS = {
            ["and"] = true, ["break"] = true, ["do"] = true, ["else"] = true, ["elseif"] = true, ["end"] = true,
            ["for"] = true, ["function"] = true, ["if"] = true, ["in"] = true, ["local"] = true, ["not"] = true,
            ["or"] = true, ["repeat"] = true, ["return"] = true, ["then"] = true, ["until"] = true, ["while"] = true,
        }
        local PROP_OK = {Character = true, PrimaryPart = true, Parent = true, CurrentCamera = true}
        local ORIGINAL_OPT = "↩ Original"

        local HAS_HOOK = type(hookmetamethod) == "function" and type(getnamecallmethod) == "function"
        local HAS_CHECK = type(checkcaller) == "function"
        local HAS_EIFS = type(writefile) == "function" and type(readfile) == "function" and type(isfile) == "function"

        local function short(text, n)
            text = tostring(text or ""):gsub("%s+", " ")
            n = n or 70
            if #text > n then
                return text:sub(1, n - 1) .. "…"
            end
            return text
        end

        --// ---------------------------------------------------------- 1) LEITURA DO TEXTO (sem executar nada)
        local function tokenize(src)
            local toks, i, n = {}, 1, #src
            local function push(t, v, s, e)
                toks[#toks + 1] = {t = t, v = v, s = s, e = e}
            end
            local ESC = {n = "\n", t = "\t", r = "\r", ["\\"] = "\\", ['"'] = '"', ["'"] = "'", a = "\a", b = "\b", f = "\f", v = "\v"}
            while i <= n do
                local c = src:sub(i, i)
                if c:match("%s") then
                    i = i + 1
                elseif c == "-" and src:sub(i, i + 1) == "--" then
                    local eq = src:match("^%-%-%[(=*)%[", i)
                    if eq then
                        local _, e = src:find("]" .. eq .. "]", i, true)
                        i = (e or n) + 1
                    else
                        local e = src:find("\n", i, true)
                        i = (e or n) + 1
                    end
                elseif c:match("[%a_]") then
                    local s, e = src:find("^[%w_]+", i)
                    push("name", src:sub(s, e), s, e)
                    i = e + 1
                elseif c:match("%d") or (c == "." and src:sub(i + 1, i + 1):match("%d")) then
                    local s, e = src:find("^0[xX]%x+", i)
                    if not s then
                        s, e = src:find("^%d*%.?%d*[eE][%+%-]?%d+", i)
                    end
                    if not s then
                        s, e = src:find("^%d*%.?%d*", i)
                    end
                    local val = tonumber(src:sub(s, e))
                    if not val then
                        return nil, "número inválido na posição " .. i
                    end
                    push("num", val, s, e)
                    i = e + 1
                elseif c == '"' or c == "'" then
                    local buf, j, closed = {}, i + 1, false
                    while j <= n do
                        local d = src:sub(j, j)
                        if d == "\\" then
                            local nx = src:sub(j + 1, j + 1)
                            if nx:match("%d") then
                                local digits = src:match("^%d%d?%d?", j + 1)
                                buf[#buf + 1] = string.char(math.min(255, tonumber(digits)))
                                j = j + 1 + #digits
                            elseif nx == "x" and src:match("^x%x%x", j + 1) then
                                buf[#buf + 1] = string.char(tonumber(src:sub(j + 2, j + 3), 16))
                                j = j + 4
                            elseif nx == "u" and src:match("^u{%x+}", j + 1) then
                                local hex = src:match("^u{(%x+)}", j + 1)
                                local okU, chr = pcall(utf8.char, tonumber(hex, 16))
                                buf[#buf + 1] = okU and chr or "?"
                                j = j + 4 + #hex
                            elseif ESC[nx] then
                                buf[#buf + 1] = ESC[nx]
                                j = j + 2
                            elseif nx == "\n" then
                                buf[#buf + 1] = "\n"
                                j = j + 2
                            else
                                buf[#buf + 1] = nx
                                j = j + 2
                            end
                        elseif d == c then
                            closed = true
                            break
                        else
                            buf[#buf + 1] = d
                            j = j + 1
                        end
                    end
                    if not closed then
                        return nil, "texto sem fechamento na posição " .. i
                    end
                    push("str", table.concat(buf), i, j)
                    i = j + 1
                elseif c == "[" and src:match("^%[=*%[", i) then
                    local eq = src:match("^%[(=*)%[", i)
                    local s0 = i + #eq + 2
                    local cs, ce = src:find("]" .. eq .. "]", s0, true)
                    if not cs then
                        return nil, "texto longo sem fechamento na posição " .. i
                    end
                    local body = src:sub(s0, cs - 1)
                    if body:sub(1, 1) == "\n" then
                        body = body:sub(2)
                    end
                    push("str", body, i, ce)
                    i = ce + 1
                else
                    local two = src:sub(i, i + 1)
                    if src:sub(i, i + 2) == "..." then
                        push("op", "...", i, i + 2)
                        i = i + 3
                    elseif two == ".." or two == "==" or two == "~=" or two == "<=" or two == ">=" then
                        push("op", two, i, i + 1)
                        i = i + 2
                    else
                        push("op", c, i, i)
                        i = i + 1
                    end
                end
                if #toks > 8000 then
                    return nil, "entrada grande demais"
                end
            end
            push("eof", "", n + 1, n)
            return toks
        end

        -- devolve {calls = {...}, notes = {...}} ou nil, erro
        local function parseRSpy(src)
            local toks, terr = tokenize(src)
            if not toks then
                return nil, terr
            end
            local p = 1
            local function peek(o)
                return toks[p + (o or 0)] or toks[#toks]
            end
            local function nextTok()
                local t = toks[p] or toks[#toks]
                if p < #toks then
                    p = p + 1
                end
                return t
            end
            local function isOp(v, o)
                local t = peek(o)
                return t.t == "op" and t.v == v
            end
            local function isName(v, o)
                local t = peek(o)
                return t.t == "name" and t.v == v
            end
            local function fail(msg)
                error({parse = msg}, 0)
            end
            local function expectOp(v)
                if isOp(v) then
                    return nextTok()
                end
                fail("esperado '" .. v .. "'")
            end

            local parseExpr

            local function skipBalanced() -- avança até ',' ou ')' no nível 0 e devolve o último token consumido
                local depth, last = 0, nil
                while true do
                    local t = peek()
                    if t.t == "eof" then
                        return last
                    end
                    if t.t == "op" then
                        if (t.v == "," or t.v == ")") and depth == 0 then
                            return last
                        end
                        if t.v == "(" or t.v == "{" or t.v == "[" then
                            depth = depth + 1
                        elseif t.v == ")" or t.v == "}" or t.v == "]" then
                            depth = depth - 1
                        end
                    end
                    last = nextTok()
                end
            end

            -- argumento de FireServer/InvokeServer: se não der para entender, o texto original é preservado como "raw"
            local function parseArgTolerant()
                local save = p
                local startTok = peek()
                local ok, node = pcall(parseExpr)
                if ok and (isOp(",") or isOp(")")) then
                    return node
                end
                p = save
                local last = skipBalanced()
                return {k = "raw", text = last and src:sub(startTok.s, last.e) or "", s = startTok.s, e = last and last.e or startTok.e}
            end

            local function parseCallArgs(tolerant)
                expectOp("(")
                local args = {}
                while not isOp(")") do
                    if peek().t == "eof" then
                        fail("chamada não fechada")
                    end
                    if tolerant then
                        args[#args + 1] = parseArgTolerant()
                    else
                        args[#args + 1] = parseExpr()
                    end
                    if isOp(",") then
                        nextTok()
                    elseif not isOp(")") then
                        fail("esperado ',' ou ')'")
                    end
                end
                return args, nextTok()
            end

            local function parseTable()
                local startTok = nextTok()
                local items, auto = {}, 0
                while not isOp("}") do
                    if peek().t == "eof" then
                        fail("tabela não fechada")
                    end
                    local item
                    if isOp("[") then
                        nextTok()
                        local k = parseExpr()
                        expectOp("]")
                        expectOp("=")
                        item = {key = k, val = parseExpr()}
                    elseif peek().t == "name" and isOp("=", 1) and not isOp("==", 1) then
                        local k = nextTok()
                        nextTok()
                        item = {key = {k = "str", v = k.v}, val = parseExpr()}
                    else
                        auto = auto + 1
                        item = {key = {k = "num", v = auto}, val = parseExpr()}
                    end
                    items[#items + 1] = item
                    if isOp(",") or isOp(";") then
                        nextTok()
                    elseif not isOp("}") then
                        fail("separador inválido na tabela")
                    end
                end
                local endTok = nextTok()
                return {k = "table", items = items, s = startTok.s, e = endTok.e}
            end

            local function parsePrimary()
                local t = peek()
                if t.t == "num" then
                    nextTok()
                    return {k = "num", v = t.v, s = t.s, e = t.e}
                elseif t.t == "str" then
                    nextTok()
                    return {k = "str", v = t.v, s = t.s, e = t.e}
                elseif t.t == "name" then
                    if t.v == "true" or t.v == "false" then
                        nextTok()
                        return {k = "bool", v = (t.v == "true"), s = t.s, e = t.e}
                    elseif t.v == "nil" then
                        nextTok()
                        return {k = "nil", s = t.s, e = t.e}
                    elseif KEYWORDS[t.v] then
                        fail("palavra reservada '" .. t.v .. "'")
                    end
                    nextTok()
                    return {k = "name", v = t.v, s = t.s, e = t.e}
                elseif t.t == "op" then
                    if t.v == "{" then
                        return parseTable()
                    elseif t.v == "(" then
                        nextTok()
                        local e = parseExpr()
                        expectOp(")")
                        return e
                    end
                end
                fail("expressão não reconhecida")
            end

            local function parsePostfix()
                local node = parsePrimary()
                while true do
                    local t = peek()
                    if t.t ~= "op" then
                        break
                    end
                    if t.v == "." then
                        nextTok()
                        local nm = nextTok()
                        if nm.t ~= "name" then
                            fail("nome esperado após '.'")
                        end
                        node = {k = "index", obj = node, key = nm.v, s = node.s, e = nm.e}
                    elseif t.v == "[" then
                        nextTok()
                        local kexp = parseExpr()
                        local close = expectOp("]")
                        if kexp.k == "str" then
                            node = {k = "index", obj = node, key = kexp.v, s = node.s, e = close.e}
                        else
                            node = {k = "indexdyn", obj = node, keyexpr = kexp, s = node.s, e = close.e}
                        end
                    elseif t.v == ":" then
                        nextTok()
                        local nm = nextTok()
                        if nm.t ~= "name" then
                            fail("nome do método esperado")
                        end
                        local tolerant = (nm.v == "FireServer" or nm.v == "InvokeServer")
                        local args, close = parseCallArgs(tolerant)
                        node = {k = "method", obj = node, name = nm.v, args = args, s = node.s, e = close.e}
                    elseif t.v == "(" then
                        local args, close = parseCallArgs(false)
                        node = {k = "call", fn = node, args = args, s = node.s, e = close.e}
                    else
                        break
                    end
                end
                return node
            end

            function parseExpr()
                local t = peek()
                if t.t == "op" and t.v == "-" then
                    nextTok()
                    local inner = parseExpr()
                    return {k = "unary", op = "-", e = inner.e, inner = inner, s = t.s}
                end
                return parsePostfix()
            end

            local calls, vars, notes = {}, {}, {}
            while peek().t ~= "eof" do
                local startP = p
                local first = peek()
                local ok = pcall(function()
                    if first.t == "name" and first.v == "local" then
                        nextTok()
                        if isName("function") then
                            fail("função local não suportada")
                        end
                        local names = {}
                        repeat
                            local nm = nextTok()
                            if nm.t ~= "name" then
                                fail("nome esperado")
                            end
                            names[#names + 1] = nm.v
                            local more = isOp(",")
                            if more then
                                nextTok()
                            end
                        until not more
                        if isOp("=") then
                            nextTok()
                            local vals = {}
                            repeat
                                vals[#vals + 1] = parseExpr()
                                local more = isOp(",")
                                if more then
                                    nextTok()
                                end
                            until not more
                            for i, nm in ipairs(names) do
                                vars[nm] = vals[i] or {k = "nil"}
                            end
                        end
                    else
                        local e = parseExpr()
                        if e.k == "method" and (e.name == "FireServer" or e.name == "InvokeServer") then
                            local snap = {}
                            for k2, v2 in pairs(vars) do
                                snap[k2] = v2
                            end
                            calls[#calls + 1] = {
                                remote = e.obj, method = e.name, args = e.args, vars = snap, src = src,
                                text = src:sub(e.s, e.e),
                            }
                        elseif isOp("=") and e.k == "name" then
                            nextTok()
                            vars[e.v] = parseExpr()
                        end
                    end
                    if isOp(";") then
                        nextTok()
                    end
                end)
                if not ok then
                    notes[#notes + 1] = "um trecho não reconhecido foi ignorado (posição " .. tostring(first.s) .. ")"
                    if p == startP then
                        nextTok()
                    end
                    while peek().t ~= "eof" do
                        local cur, prev = peek(), toks[p - 1]
                        if cur.t == "name" and (cur.v == "local" or (prev and (
                            (prev.t == "op" and (prev.v == ")" or prev.v == "}" or prev.v == "]"))
                            or (prev.t == "name" and prev.v == "end")))) then
                            break
                        end
                        nextTok()
                    end
                end
            end
            return {calls = calls, notes = notes}
        end

        --// ---------------------------------------------------------- 2) CAMINHOS E INSTÂNCIAS (resolução estrita)
        local function pathText(path)
            if #path.segs == 0 then
                return "game"
            end
            return "game." .. table.concat(path.segs, ".")
        end

        local function copySegs(segs, extra)
            local out = {}
            for i, s in ipairs(segs) do
                out[i] = s
            end
            if extra then
                out[#out + 1] = extra
            end
            return out
        end

        local function pathOf(node, env, depth)
            if depth > 24 then
                return nil
            end
            local k = node.k
            if k == "name" then
                local bound = env.vars[node.v]
                if bound then
                    return pathOf(bound, env, depth + 1)
                end
                if node.v == "game" then
                    return {segs = {}}
                elseif node.v == "workspace" or node.v == "Workspace" then
                    return {segs = {"Workspace"}}
                end
                return nil
            elseif k == "index" then
                local base = pathOf(node.obj, env, depth + 1)
                if not base then
                    return nil
                end
                return {segs = copySegs(base.segs, node.key)}
            elseif k == "method" then
                local base = pathOf(node.obj, env, depth + 1)
                local a1 = node.args[1]
                if not base or not a1 or a1.k ~= "str" then
                    return nil
                end
                if node.name == "GetService" and #base.segs == 0 and #node.args == 1 then
                    return {segs = {a1.v}}
                elseif node.name == "WaitForChild" and (#node.args == 1 or (#node.args == 2 and node.args[2].k == "num")) then
                    return {segs = copySegs(base.segs, a1.v)}
                elseif node.name == "FindFirstChild" and #node.args == 1 then
                    return {segs = copySegs(base.segs, a1.v)}
                end
                return nil
            end
            return nil
        end

        -- devolve a instância ou nil, motivo. Nomes repetidos no mesmo pai = ambíguo = não resolve.
        local function resolveStrict(path)
            local cur = game
            for _, seg in ipairs(path.segs) do
                local nxt
                local okf, found = pcall(function()
                    return cur:FindFirstChild(seg)
                end)
                if okf and found then
                    local count = 0
                    local okc, kids = pcall(function()
                        return cur:GetChildren()
                    end)
                    if okc then
                        for _, kid in ipairs(kids) do
                            if kid.Name == seg then
                                count = count + 1
                            end
                        end
                    end
                    if count > 1 then
                        return nil, "nome repetido '" .. seg .. "' dentro de '" .. cur.Name .. "' (ambíguo)"
                    end
                    nxt = found
                elseif cur == game then
                    local oks, svc = pcall(game.GetService, game, seg)
                    if oks and svc then
                        nxt = svc
                    end
                end
                if not nxt and cur == Players and seg == "LocalPlayer" then
                    nxt = LocalPlayer
                end
                if not nxt and PROP_OK[seg] then
                    local okp, v = pcall(function()
                        return cur[seg]
                    end)
                    if okp and typeof(v) == "Instance" then
                        nxt = v
                    end
                end
                if not nxt then
                    return nil, "'" .. seg .. "' não encontrado"
                end
                cur = nxt
            end
            return cur
        end

        local function parsePathInput(text)
            local px = parsePathExpr(text)
            if px then
                return {segs = px.segs}
            end
            local segs = {}
            for part in tostring(text or ""):gmatch("[^%./\\]+") do
                segs[#segs + 1] = trim(part)
            end
            if segs[1] and segs[1]:lower() == "game" then
                table.remove(segs, 1)
            elseif segs[1] and segs[1]:lower() == "workspace" then
                segs[1] = "Workspace"
            end
            if #segs == 0 then
                return nil
            end
            return {segs = segs}
        end

        -- instância real → caminho (nomes a partir do game); nil se não estiver dentro do jogo
        local function pathFromInstance(inst)
            local segs, cur = {}, inst
            for _ = 1, 40 do
                if cur == game then
                    local n = #segs
                    if n == 0 then
                        return nil
                    end
                    local out = {}
                    for i = n, 1, -1 do
                        out[#out + 1] = segs[i]
                    end
                    return {segs = out}
                end
                if typeof(cur) ~= "Instance" then
                    return nil
                end
                segs[#segs + 1] = cur.Name
                local par = cur.Parent
                if par == nil then
                    return nil
                end
                cur = par
            end
            return nil
        end

        -- uma Tool troca de Backpack para Character ao ser equipada: devolve o caminho "do outro lado"
        local function toolAlt(path)
            local segs = path.segs
            if segs[1] == "Players" and (segs[3] == "Backpack" or segs[3] == "Character") then
                local out = {}
                for i, s in ipairs(segs) do
                    out[i] = s
                end
                out[3] = (segs[3] == "Backpack") and "Character" or "Backpack"
                return {segs = out}
            end
            return nil
        end

        --// ---------------------------------------------------------- 3) DESCRITORES (valor lido, nunca executado)
        local function evalNode(node, env, depth)
            depth = depth or 0
            if depth > 24 then
                return {t = "raw", text = "profundidade excedida"}
            end
            local k = node.k
            local function textOf()
                if env.src and node.s and node.e then
                    return env.src:sub(node.s, node.e)
                end
                return node.text or "?"
            end
            if k == "num" then
                return {t = "number", v = node.v}
            elseif k == "str" then
                return {t = "string", v = node.v}
            elseif k == "bool" then
                return {t = "boolean", v = node.v}
            elseif k == "nil" then
                return {t = "nil"}
            elseif k == "raw" then
                return {t = "raw", text = node.text}
            elseif k == "unary" then
                local d = evalNode(node.inner, env, depth + 1)
                if d.t == "number" then
                    return {t = "number", v = -d.v}
                end
                return {t = "raw", text = textOf()}
            elseif k == "name" then
                local bound = env.vars[node.v]
                if bound then
                    return evalNode(bound, env, depth + 1)
                end
                if node.v == "game" or node.v == "workspace" or node.v == "Workspace" then
                    local path = pathOf(node, env, 0)
                    return {t = "instance", path = path, text = pathText(path)}
                end
                return {t = "raw", text = textOf(), why = "variável desconhecida '" .. node.v .. "'"}
            elseif k == "table" then
                local entries = {}
                for _, it in ipairs(node.items) do
                    entries[#entries + 1] = {k = evalNode(it.key, env, depth + 1), v = evalNode(it.val, env, depth + 1)}
                end
                return {t = "table", entries = entries}
            end

            local path = pathOf(node, env, 0)
            if path then
                return {t = "instance", path = path, text = pathText(path)}
            end
            if k == "index" and node.obj.k == "index" and node.obj.obj.k == "name" and node.obj.obj.v == "Enum" and not env.vars.Enum then
                local okE, item = pcall(function()
                    return Enum[node.obj.key][node.key]
                end)
                if okE and item then
                    return {t = "Enum", enum = node.obj.key, item = node.key}
                end
            end
            if k == "call" and node.fn.k == "index" and node.fn.obj.k == "name" and not env.vars[node.fn.obj.v] then
                local lib, fn = node.fn.obj.v, node.fn.key
                local nums = {}
                for _, a in ipairs(node.args) do
                    local d = evalNode(a, env, depth + 1)
                    if d.t ~= "number" then
                        nums = nil
                        break
                    end
                    nums[#nums + 1] = d.v
                end
                if lib == "Vector3" and fn == "new" and nums and #nums == 3 then
                    return {t = "Vector3", x = nums[1], y = nums[2], z = nums[3]}
                elseif lib == "Vector2" and fn == "new" and nums and #nums == 2 then
                    return {t = "Vector2", x = nums[1], y = nums[2]}
                elseif lib == "CFrame" and fn == "new" then
                    if nums and #nums == 3 then
                        return {t = "CFrame", x = nums[1], y = nums[2], z = nums[3]}
                    elseif nums and #nums == 12 then
                        return {t = "CFrame", x = nums[1], y = nums[2], z = nums[3], comps = nums}
                    elseif #node.args == 1 then
                        local d1 = evalNode(node.args[1], env, depth + 1)
                        if d1.t == "Vector3" then
                            return {t = "CFrame", x = d1.x, y = d1.y, z = d1.z}
                        end
                    end
                elseif lib == "Color3" and (fn == "fromRGB" or fn == "new") and nums and #nums == 3 then
                    return {t = "Color3", r = nums[1], g = nums[2], b = nums[3], fn = fn}
                end
            end
            return {t = "raw", text = textOf()}
        end

        local ids, idN = setmetatable({}, {__mode = "k"}), 0
        local function idOf(o)
            local i = ids[o]
            if not i then
                idN = idN + 1
                i = idN
                ids[o] = i
            end
            return i
        end

        local function descKey(d, depth)
            depth = depth or 0
            local t = d.t
            if t == "number" then
                return "n:" .. string.format("%.17g", d.v)
            elseif t == "string" then
                return "s:" .. #d.v .. ":" .. d.v
            elseif t == "boolean" then
                return "b:" .. tostring(d.v)
            elseif t == "nil" then
                return "nil"
            elseif t == "Vector3" then
                return string.format("v3:%.9g,%.9g,%.9g", d.x, d.y, d.z)
            elseif t == "Vector2" then
                return string.format("v2:%.9g,%.9g", d.x, d.y)
            elseif t == "CFrame" then
                if d.comps then
                    local parts = {}
                    for i, c in ipairs(d.comps) do
                        parts[i] = string.format("%.9g", c)
                    end
                    return "cf:" .. table.concat(parts, ",")
                end
                return string.format("cf:%.9g,%.9g,%.9g", d.x, d.y, d.z)
            elseif t == "Color3" then
                return string.format("c3:%.6g,%.6g,%.6g", d.r, d.g, d.b)
            elseif t == "Enum" then
                return "e:" .. d.enum .. "." .. d.item
            elseif t == "instance" then
                if d.inst then
                    return "i:" .. idOf(d.inst)
                end
                return "ip:" .. tostring(d.text)
            elseif t == "table" then
                if depth > 4 then
                    return "t:deep"
                end
                local parts = {}
                for _, e in ipairs(d.entries) do
                    parts[#parts + 1] = descKey(e.k, depth + 1) .. "=" .. descKey(e.v, depth + 1)
                end
                table.sort(parts)
                return "t{" .. table.concat(parts, ";") .. "}"
            end
            return "raw:" .. tostring(d.text)
        end

        -- valor real observado no jogo → descritor
        local function descFromValue(v, depth)
            depth = depth or 0
            local t = typeof(v)
            if t == "number" or t == "string" or t == "boolean" then
                return {t = t, v = v}
            elseif t == "nil" then
                return {t = "nil"}
            elseif t == "Vector3" then
                return {t = "Vector3", x = v.X, y = v.Y, z = v.Z}
            elseif t == "Vector2" then
                return {t = "Vector2", x = v.X, y = v.Y}
            elseif t == "CFrame" then
                local c = {v:GetComponents()}
                return {t = "CFrame", x = c[1], y = c[2], z = c[3], comps = c}
            elseif t == "Color3" then
                return {t = "Color3", r = v.R, g = v.G, b = v.B, fn = "new"}
            elseif t == "EnumItem" then
                return {t = "Enum", enum = tostring(v.EnumType), item = v.Name}
            elseif t == "Instance" then
                local okN, full = pcall(v.GetFullName, v)
                local okPath, pth = pcall(pathFromInstance, v) -- permite achar o objeto de novo se ele for recriado (respawn)
                return {t = "instance", inst = v, text = okN and full or v.Name, path = okPath and pth or nil}
            elseif t == "table" then
                if depth >= 3 then
                    return {t = "raw", text = "tabela muito profunda"}
                end
                local entries, count = {}, 0
                for key, val in pairs(v) do
                    count = count + 1
                    if count > 50 then
                        return {t = "raw", text = "tabela com mais de 50 itens"}
                    end
                    local kt = type(key)
                    if kt ~= "number" and kt ~= "string" then
                        return {t = "raw", text = "tabela com chave de tipo não suportado"}
                    end
                    entries[#entries + 1] = {k = {t = kt, v = key}, v = descFromValue(val, depth + 1)}
                end
                table.sort(entries, function(a, b)
                    local ka, kb = a.k.v, b.k.v
                    if type(ka) == type(kb) then
                        return ka < kb
                    end
                    return type(ka) == "number"
                end)
                return {t = "table", entries = entries}
            end
            return {t = "raw", text = "<" .. t .. ">"}
        end

        -- descritor → valor do Roblox. Devolve true, valor  |  false, motivo
        local function realize(d)
            local t = d.t
            if t == "number" or t == "string" or t == "boolean" then
                return true, d.v
            elseif t == "nil" then
                return true, nil
            elseif t == "Vector3" then
                return true, Vector3.new(d.x, d.y, d.z)
            elseif t == "Vector2" then
                return true, Vector2.new(d.x, d.y)
            elseif t == "CFrame" then
                if d.comps and #d.comps == 12 then
                    return true, CFrame.new(table.unpack(d.comps, 1, 12))
                end
                return true, CFrame.new(d.x, d.y, d.z)
            elseif t == "Color3" then
                if d.fn == "fromRGB" then
                    return true, Color3.fromRGB(d.r, d.g, d.b)
                end
                return true, Color3.new(d.r, d.g, d.b)
            elseif t == "Enum" then
                local okE, item = pcall(function()
                    return Enum[d.enum][d.item]
                end)
                if okE and item then
                    return true, item
                end
                return false, "Enum " .. tostring(d.enum) .. "." .. tostring(d.item) .. " indisponível"
            elseif t == "instance" then
                if d.dyn == "player" then
                    local plr
                    if d.who == "@me" then
                        plr = LocalPlayer
                    else
                        local f = Players:FindFirstChild(d.who)
                        plr = f and f:IsA("Player") and f or nil
                    end
                    if not plr then
                        return false, "jogador '" .. tostring(d.who) .. "' não está no servidor"
                    end
                    if d.as == "character" then
                        if plr.Character then
                            return true, plr.Character
                        end
                        return false, "o personagem de '" .. plr.Name .. "' não existe agora"
                    end
                    return true, plr
                end
                local inst = d.inst
                if inst and (inst == game or inst.Parent ~= nil) then
                    return true, inst
                end
                if d.path then
                    local again, why = resolveStrict(d.path)
                    if again then
                        d.inst = again
                        return true, again
                    end
                    return false, "instância não resolvida: " .. tostring(why)
                end
                return false, "a instância não existe mais"
            elseif t == "table" then
                local out = {}
                for _, e in ipairs(d.entries) do
                    local okk, kk = realize(e.k)
                    if not okk then
                        return false, kk
                    end
                    local okv, vv = realize(e.v)
                    if not okv then
                        return false, vv
                    end
                    if kk == nil then
                        return false, "chave nula na tabela"
                    end
                    out[kk] = vv
                end
                return true, out
            end
            return false, "argumento não interpretado (original preservado; não pode ser enviado sem análise manual)"
        end

        local function showValue(v)
            local t = typeof(v)
            if t == "Instance" then
                return v.ClassName .. " '" .. v.Name .. "'"
            elseif t == "Vector3" then
                return string.format("Vector3(%.2f, %.2f, %.2f)", v.X, v.Y, v.Z)
            elseif t == "CFrame" then
                return string.format("CFrame(%.2f, %.2f, %.2f)", v.X, v.Y, v.Z)
            elseif t == "string" then
                return '"' .. short(v, 40) .. '"'
            elseif t == "table" then
                local c = 0
                for _ in pairs(v) do
                    c = c + 1
                end
                return "{" .. c .. " item(ns)}"
            end
            return tostring(v)
        end

        --// ---------------------------------------------------------- 4) ANÁLISE POR ARGUMENTO (confiança individual)
        local function table3(d)
            if d.t ~= "table" or #d.entries ~= 3 then
                return nil
            end
            local arr, xyz = {}, {}
            for _, e in ipairs(d.entries) do
                if e.v.t ~= "number" then
                    return nil
                end
                if e.k.t == "number" and e.k.v >= 1 and e.k.v <= 3 and e.k.v % 1 == 0 then
                    arr[e.k.v] = e.v.v
                elseif e.k.t == "string" then
                    local lk = e.k.v:lower()
                    if lk == "x" or lk == "y" or lk == "z" then
                        xyz[lk] = {key = e.k.v, v = e.v.v}
                    end
                end
            end
            if arr[1] and arr[2] and arr[3] then
                return {style = "array", v = {arr[1], arr[2], arr[3]}}
            end
            if xyz.x and xyz.y and xyz.z then
                return {style = "xyz", keys = {xyz.x.key, xyz.y.key, xyz.z.key}, v = {xyz.x.v, xyz.y.v, xyz.z.v}}
            end
            return nil
        end

        local function typeTag(d)
            if d.t == "table" then
                return "table(" .. #d.entries .. ")"
            end
            return d.t
        end

        local INTERPS = {
            playername = {label = "Nome de jogador (continua texto)", need = function(d) return d.t == "string" end},
            userid = {label = "UserId de jogador (continua número)", need = function(d) return d.t == "number" end},
            coords3 = {label = "Coordenadas {x,y,z} (continua tabela)", need = function(d) return table3(d) ~= nil end},
        }
        local function interpFor(d)
            if d.t == "string" then
                return "playername"
            elseif d.t == "number" then
                return "userid"
            elseif table3(d) then
                return "coords3"
            end
            return nil
        end

        local function hintFor(d)
            if d.t == "string" then
                for _, pl in ipairs(Players:GetPlayers()) do
                    if pl.Name == d.v or pl.DisplayName == d.v then
                        return "coincide com o nome do jogador " .. pl.Name .. " (não presumido)"
                    end
                end
            elseif d.t == "number" then
                for _, pl in ipairs(Players:GetPlayers()) do
                    if pl.UserId == d.v then
                        return "coincide com o UserId de " .. pl.Name .. " (não presumido)"
                    end
                end
            end
            return nil
        end

        -- {kind, conf, reason, reqClass}; conf: alta | confirmada | baixa | desconhecida
        local function analyze(d, interp)
            local t = d.t
            if interp and INTERPS[interp] and INTERPS[interp].need(d) then
                return {kind = interp, conf = "confirmada", reason = "você confirmou: " .. INTERPS[interp].label}
            end
            if t == "Vector3" then
                return {kind = "vector3", conf = "alta", reason = "valor Vector3 real (X, Y, Z)"}
            elseif t == "CFrame" then
                return {kind = "cframe", conf = "alta", reason = "CFrame real (posição X, Y, Z; rotação preservada)"}
            elseif t == "instance" then
                local inst = d.inst
                if not inst then
                    return {kind = "unresolved", conf = "baixa", reason = "referência a objeto não resolvida agora (" .. short(d.err or d.text, 80) .. "); preservada"}
                end
                local okC, res = pcall(function()
                    if inst:IsA("Player") then
                        return {kind = "player", conf = "alta", reason = "referência real a um jogador (" .. inst.Name .. ")", reqClass = "Player"}
                    end
                    if inst:IsA("Model") then
                        local owner = Players:GetPlayerFromCharacter(inst)
                        if owner then
                            return {kind = "character", conf = "alta", reason = "personagem real de " .. owner.Name, reqClass = "Model"}
                        end
                        return {kind = "model", conf = "alta", reason = "Model real '" .. inst.Name .. "'", reqClass = "Model"}
                    end
                    if inst:IsA("BasePart") then
                        return {kind = "part", conf = "alta", reason = "Part real '" .. inst.Name .. "'", reqClass = "BasePart"}
                    end
                    return {kind = "instance", conf = "alta", reason = inst.ClassName .. " real '" .. inst.Name .. "'", reqClass = inst.ClassName}
                end)
                if okC then
                    return res
                end
                return {kind = "unresolved", conf = "baixa", reason = "objeto inacessível; preservado"}
            elseif t == "number" then
                return {kind = "number", conf = "desconhecida", reason = "número (significado desconhecido; valor original preservado)"}
            elseif t == "string" then
                return {kind = "string", conf = "desconhecida", reason = "texto (significado desconhecido; valor original preservado)"}
            elseif t == "boolean" then
                return {kind = "boolean", conf = "desconhecida", reason = "booleano (significado desconhecido; valor original preservado)"}
            elseif t == "nil" then
                return {kind = "nil", conf = "desconhecida", reason = "nil preservado"}
            elseif t == "table" then
                if table3(d) then
                    return {kind = "table", conf = "desconhecida", reason = "tabela com 3 números: pode ser coordenadas, mas isso não foi presumido"}
                end
                return {kind = "table", conf = "desconhecida", reason = "tabela preservada (" .. #d.entries .. " item(ns))"}
            elseif t == "Enum" or t == "Vector2" or t == "Color3" then
                return {kind = t, conf = "desconhecida", reason = t .. " preservado (sem controle dedicado)"}
            end
            return {kind = "raw", conf = "desconhecida", reason = "expressão não interpretada, preservada: " .. short(d.why or d.text, 60)}
        end

        local CONF_TXT = {
            alta = "confiança ALTA", confirmada = "CONFIRMADO por você", baixa = "confiança BAIXA",
            desconhecida = "significado DESCONHECIDO",
        }

        --// ---------------------------------------------------------- 5) PERFIS (observado ≠ interpretado ≠ configuração do usuário)
        local syncWatch, refreshInfo, onLearned
        local profiles = {}   -- lista de perfis
        local byLabel = {}
        local saved = {}      -- interpretações confirmadas, lidas do arquivo
        local ui = {playerDds = {}}
        local enabled = false
        local sending = false
        local lastSend = 0
        local hookError

        local function loadSaved()
            if not HAS_EIFS then
                return
            end
            local ok, raw = pcall(function()
                if isfile(SAVE_FILE) then
                    return readfile(SAVE_FILE)
                end
            end)
            if ok and type(raw) == "string" and raw ~= "" then
                local ok2, data = pcall(function()
                    return HttpService:JSONDecode(raw)
                end)
                if ok2 and type(data) == "table" and type(data.interps) == "table" then
                    saved = data.interps
                end
            end
        end
        local function writeSaved()
            if not HAS_EIFS then
                return false
            end
            return (pcall(function()
                writefile(SAVE_FILE, HttpService:JSONEncode({v = 1, interps = saved}))
            end))
        end

        local function signature(p)
            local tags = {}
            for i, s in ipairs(p.slots) do
                tags[i] = typeTag(s.original)
            end
            return tostring(p.key) .. "|" .. p.n .. "|" .. table.concat(tags, ",")
        end

        local function newSlot(i, d)
            return {idx = i, original = d, analysis = analyze(d, nil), changes = 0, edited = false}
        end

        local function profileFromCall(call)
            local env = {src = call.src, vars = call.vars}
            local p = {method = call.method, slots = {}, n = 0, notes = {}, srcText = short(call.text, 400),
                follow = true, monitor = true, obs = {count = 0}}
            local rpath = pathOf(call.remote, env, 0)
            if rpath and #rpath.segs > 0 then
                p.path = rpath
                p.key = pathText(rpath)
                local inst, why = resolveStrict(rpath)
                if inst and (inst:IsA("RemoteEvent") or inst:IsA("RemoteFunction")) then
                    p.remote = inst
                elseif inst then
                    p.manual = "o objeto encontrado é " .. inst.ClassName .. ", não um Remote"
                else
                    p.manual = "Remote não encontrado agora (" .. tostring(why) .. ")"
                    p.manualRemote = true
                end
            else
                p.key = short(call.src:sub(call.remote.s or 1, call.remote.e or 1), 80)
                p.manual = "caminho do Remote não reconhecido: " .. p.key
            end
            if p.remote then
                if p.method == "FireServer" and not p.remote:IsA("RemoteEvent") then
                    p.manual = "a chamada usa FireServer, mas o objeto é RemoteFunction"
                elseif p.method == "InvokeServer" and not p.remote:IsA("RemoteFunction") then
                    p.manual = "a chamada usa InvokeServer, mas o objeto é RemoteEvent"
                end
            end

            -- expande unpack(tabela literal) somente quando a estrutura é inequívoca
            local nodes = call.args
            if #nodes == 1 and nodes[1].k == "call" then
                local a, f = nodes[1], nodes[1].fn
                local isUnpack = (f.k == "name" and f.v == "unpack" and not env.vars.unpack)
                    or (f.k == "index" and f.obj.k == "name" and f.obj.v == "table" and f.key == "unpack")
                if isUnpack then
                    local why
                    local expanded
                    if #a.args ~= 1 then
                        why = "unpack com intervalo ou argumentos extras"
                    else
                        local tnode = a.args[1]
                        if tnode.k == "name" and env.vars[tnode.v] then
                            tnode = env.vars[tnode.v]
                        end
                        if tnode.k ~= "table" then
                            why = "unpack de algo que não é uma tabela literal"
                        else
                            local byIdx, maxI, cnt = {}, 0, 0
                            for _, it in ipairs(tnode.items) do
                                local kd = it.key and it.key.k == "num" and it.key.v
                                if not kd or kd < 1 or kd % 1 ~= 0 or byIdx[kd] then
                                    why = "tabela do unpack com chaves que não são 1..N"
                                    break
                                end
                                byIdx[kd] = it.val
                                cnt = cnt + 1
                                if kd > maxI then
                                    maxI = kd
                                end
                            end
                            if not why and maxI ~= cnt then
                                why = "tabela do unpack com buracos"
                            end
                            if not why then
                                expanded = {}
                                for i = 1, maxI do
                                    expanded[i] = byIdx[i]
                                end
                            end
                        end
                    end
                    if expanded then
                        nodes = expanded
                    else
                        p.manual = p.manual or ("argumentos via unpack não reconhecidos: " .. tostring(why))
                        nodes = {{k = "raw", text = call.src:sub(a.s, a.e)}}
                    end
                end
            end
            if #nodes > MAX_ARGS then
                p.manual = p.manual or ("mais de " .. MAX_ARGS .. " argumentos")
                local cut = {}
                for i = 1, MAX_ARGS do
                    cut[i] = nodes[i]
                end
                nodes = cut
            end
            for i, node in ipairs(nodes) do
                local d = evalNode(node, env, 0)
                if d.t == "instance" and d.path then
                    d.inst, d.err = resolveStrict(d.path)
                end
                p.slots[i] = newSlot(i, d)
            end
            p.n = #nodes
            p.sig = signature(p)
            local keys = {}
            for i, s in ipairs(p.slots) do
                keys[i] = descKey(s.original)
            end
            p.callKey = p.key .. "|" .. p.method .. "|" .. table.concat(keys, "|")
            return p
        end

        local function applySaved(p)
            local sv = saved[p.key]
            if type(sv) ~= "table" then
                return
            end
            if sv.sig ~= p.sig then
                Win:Log("INFO", "Event Intelligence: interpretação salva de '" .. short(p.key, 50) .. "' ignorada (estrutura diferente da chamada atual)")
                return
            end
            local applied = 0
            for i, s in ipairs(p.slots) do
                local rec = type(sv.slots) == "table" and sv.slots[tostring(i)]
                if type(rec) == "table" and rec.t == typeTag(s.original) and INTERPS[rec.interp] and INTERPS[rec.interp].need(s.original) then
                    s.interp = rec.interp
                    s.analysis = analyze(s.original, s.interp)
                    applied = applied + 1
                end
            end
            if applied > 0 then
                Win:Log("INFO", "Event Intelligence: " .. applied .. " interpretação(ões) salva(s) reaplicada(s) em '" .. short(p.key, 50) .. "' (estrutura compatível)")
            end
        end

        local function profileLabel(p)
            local base = tostring(p.key):match("([^%.]+)$") or p.key
            if p.learning then
                return base .. " · aprendendo…"
            end
            return base .. " · " .. p.method .. " (" .. p.n .. ")"
        end

        --// ---------------------------------------------------------- 5b) MODO SÓ CAMINHO (a estrutura vem da 1ª chamada real observada)
        -- Só o caminho do Remote é informado. Nada é inventado: os argumentos só passam a existir
        -- depois que o próprio jogo chama o evento e o monitoramento lê essa chamada.
        local function remoteKind(inst)
            return inst:IsA("RemoteFunction") and "InvokeServer" or "FireServer"
        end

        local function profileFromPath(text)
            local path = parsePathInput(text)
            if not path then
                return nil, "informe o caminho do evento"
            end
            local p = {
                method = "FireServer", slots = {}, n = 0, notes = {}, srcText = short(text, 400),
                follow = true, monitor = true, obs = {count = 0},
                pathOnly = true, learning = true, toolAware = true,
                path = path, key = pathText(path),
            }
            local inst = resolveStrict(path)
            if not inst then
                local alt = toolAlt(path)
                inst = alt and resolveStrict(alt) or nil
            end
            if inst and (inst:IsA("RemoteEvent") or inst:IsA("RemoteFunction")) then
                p.remote = inst
                p.method = remoteKind(inst)
            elseif inst then
                return nil, "o objeto encontrado é " .. inst.ClassName .. ", não um Remote"
            end -- não achou agora: o perfil fica esperando o item/objeto existir
            p.sig = signature(p)
            p.callKey = p.key .. "|auto"
            return p
        end

        -- transforma a 1ª chamada observada na estrutura do perfil
        local function learnFrom(p, descs, n, method)
            local cap = math.min(n, MAX_ARGS)
            local slots = {}
            for i = 1, cap do
                slots[i] = newSlot(i, descs[i])
            end
            p.slots, p.n = slots, cap
            p.method = method or p.method
            p.learning, p.learned = false, true
            if n > MAX_ARGS then
                p.manual = "mais de " .. MAX_ARGS .. " argumentos"
            end
            p.sig = signature(p)
            applySaved(p)
            p.notes[#p.notes + 1] = "Estrutura aprendida sozinha pela 1ª chamada real do jogo (" .. cap .. " argumento(s)). 'Seguir valores observados' está ligado: o envio repete os valores da chamada mais recente."
        end

        local function getRemote(p)
            if p.remote and p.remote.Parent then
                return p.remote
            end
            if p.path then
                local inst = resolveStrict(p.path)
                if not inst and p.toolAware then
                    local alt = toolAlt(p.path)
                    inst = alt and resolveStrict(alt) or nil
                end
                if inst and (inst:IsA("RemoteEvent") or inst:IsA("RemoteFunction")) then
                    p.remote = inst
                    return inst
                end
            end
            p.remote = nil
            return nil
        end

        --// ---------------------------------------------------------- 6) MONITORAMENTO EM TEMPO REAL (somente o que o executor permite)
        local hookState = ENV[HOOK_KEY]
        if type(hookState) ~= "table" then
            hookState = {installed = false}
            ENV[HOOK_KEY] = hookState
        end
        hookState.handler = nil -- uma reexecução assume o gancho já instalado, sem instalar outro

        local watched = {}
        local watchedCount = 0
        local queue, qn, scheduled, dropped = {}, 0, false, 0

        local function ensureHook()
            if not HAS_HOOK then
                return false, "o executor não oferece hookmetamethod/getnamecallmethod"
            end
            if hookState.installed then
                return true
            end
            local ok, err = pcall(function()
                local old
                local wrap = type(newcclosure) == "function" and newcclosure or function(f)
                    return f
                end
                old = hookmetamethod(game, "__namecall", wrap(function(self, ...)
                    local h = hookState.handler
                    if h then
                        local method = getnamecallmethod()
                        if method == "FireServer" or method == "InvokeServer" then
                            h(self, method, ...)
                        end
                    end
                    return old(self, ...)
                end))
                hookState.installed = true
            end)
            if not ok then
                return false, tostring(err)
            end
            return true
        end

        local onObserved
        local function processQueue()
            scheduled = false
            local batch, count = queue, qn
            queue, qn = {}, 0
            for i = 1, count do
                local ok, err = pcall(onObserved, batch[i])
                if not ok then
                    Win:Log("ERROR", "Event Intelligence: falha ao processar chamada observada", tostring(err))
                end
            end
        end

        -- roda dentro do __namecall: sem chamadas de método, sem yield; só guarda e adia
        local function handler(self, method, ...)
            local list = watched[self]
            if not list or sending then
                return
            end
            if HAS_CHECK and checkcaller() then
                return
            end
            for i = 1, #list do -- mais de um perfil pode acompanhar o mesmo Remote
                if qn >= MAX_QUEUE then
                    dropped = dropped + 1
                    return
                end
                qn = qn + 1
                queue[qn] = {prof = list[i], method = method, n = select("#", ...), args = {...}, t = os.clock()}
            end
            if not scheduled then
                scheduled = true
                task.defer(processQueue)
            end
        end

        local function monitorStatus(p)
            if not enabled then
                return "Event Intelligence desativado (nada é monitorado; configurações preservadas)"
            end
            if not p.monitor then
                return "monitoramento desligado para este evento; valores = chamada colada"
            end
            if not HAS_HOOK then
                return "SEM monitoramento em tempo real: o executor não oferece hookmetamethod/getnamecallmethod (valores = chamada colada)"
            end
            if hookError then
                return "SEM monitoramento: falha ao instalar o gancho (" .. short(hookError, 60) .. ")"
            end
            if not p.remote or not p.remote.Parent then
                return "SEM monitoramento: o Remote não foi encontrado (use 'Atualizar')"
            end
            return "monitoramento ATIVO: acompanhando chamadas feitas pelos scripts do jogo"
        end

        function syncWatch()
            watched, watchedCount = {}, 0
            if enabled then
                for _, p in ipairs(profiles) do
                    if p.monitor then
                        local r = getRemote(p)
                        if r then
                            local list = watched[r]
                            if not list then
                                list = {}
                                watched[r] = list
                                watchedCount = watchedCount + 1
                            end
                            list[#list + 1] = p
                        end
                    end
                end
            end
            if watchedCount > 0 then
                local ok, err = ensureHook()
                if ok then
                    hookError = nil
                    hookState.handler = handler
                else
                    hookError = err
                    hookState.handler = nil
                    watched, watchedCount = {}, 0
                end
            else
                hookState.handler = nil
                queue, qn = {}, 0
            end
        end

        local infoPending = false
        local function scheduleInfo()
            if infoPending then
                return
            end
            infoPending = true
            task.delay(0.3, function()
                infoPending = false
                if refreshInfo then
                    pcall(refreshInfo)
                end
            end)
        end

        function onObserved(item)
            local p = item.prof
            local n = item.n
            local descs = {}
            local cap = math.min(n, MAX_ARGS)
            for i = 1, cap do
                descs[i] = descFromValue(item.args[i])
            end
            if p.learning then -- modo só caminho: a 1ª chamada real define a estrutura
                local okL, errL = pcall(learnFrom, p, descs, n, item.method)
                if okL then
                    local cb = onLearned
                    if cb then
                        pcall(cb, p)
                    end
                else
                    Win:Log("ERROR", "Event Intelligence: falha ao aprender '" .. short(p.key, 50) .. "'", tostring(errL))
                end
            end
            local o = p.obs
            local first = o.count == 0
            o.count = o.count + 1
            o.last = os.clock()
            o.dropped = dropped
            if o.n ~= nil and o.n ~= n then
                o.structChanges = (o.structChanges or 0) + 1
                if o.structChanges <= 3 then
                    Win:Log("WARNING", "Event Intelligence: a estrutura de '" .. short(p.key, 50) .. "' mudou (" .. o.n .. " → " .. n .. " argumento(s))")
                end
            end
            if first and n ~= p.n then
                Win:Log("WARNING", "Event Intelligence: a 1ª chamada observada de '" .. short(p.key, 50) .. "' tem " .. n .. " argumento(s); a chamada colada tinha " .. p.n)
            end
            o.n = n
            o.maxN = math.max(o.maxN or 0, n)
            local prev = p.lastObs
            for i = 1, cap do
                local s = p.slots[i]
                if s and prev and prev[i] then
                    if descKey(prev[i]) ~= descKey(descs[i]) then
                        s.changes = s.changes + 1
                        s.varies = true
                    end
                    if prev[i].t ~= descs[i].t then
                        s.typeVaries = true
                    end
                end
                if s and first and s.original.t ~= descs[i].t then
                    s.typeVaries = true
                end
            end
            p.lastObs = descs
            if first then
                Win:Log("INFO", "Event Intelligence: primeira chamada observada de '" .. short(p.key, 50) .. "'")
            end
            scheduleInfo()
        end

        --// ---------------------------------------------------------- 7) MONTAGEM E ENVIO (só quando o usuário pede)
        local function slotDesc(p, s)
            local d = s.original
            if p.follow and not s.edited and p.lastObs and p.lastObs[s.idx] then
                local o = p.lastObs[s.idx]
                if o.t == d.t and (d.t ~= "table" or #o.entries == #d.entries) then
                    d = o
                end
            end
            if s.override then
                d = s.override
            end
            return d
        end

        local function buildArgs(p)
            local args = {}
            for i = 1, p.n do
                local ok, v = realize(slotDesc(p, p.slots[i]))
                if not ok then
                    return nil, i, v
                end
                args[i] = v
            end
            return args
        end

        local function previewArgs(p)
            if p.learning then
                notify("Event Intelligence", "Ainda aprendendo: faça a ação no jogo uma vez para eu ler os argumentos.", "warning")
                return
            end
            local args, bad, why = buildArgs(p)
            if not args then
                notify("Event Intelligence", "Argumento #" .. bad .. " não pode ser montado: " .. tostring(why), "warning")
                return
            end
            local parts = {}
            for i = 1, p.n do
                parts[i] = "#" .. i .. " " .. showValue(args[i])
            end
            notify("Argumentos de " .. short(p.key, 30), p.n == 0 and "(nenhum argumento)" or table.concat(parts, " · "), "info")
        end

        local function sendNow(p)
            if not enabled then
                notify("Event Intelligence", "Ative o Event Intelligence para enviar.", "warning")
                return
            end
            if p.learning then
                notify("Event Intelligence", "Ainda aprendendo: faça a ação no jogo uma vez para eu ler os argumentos. Nada foi enviado.", "warning")
                return
            end
            if p.manual then
                notify("Event Intelligence", "Este evento precisa de análise manual: " .. p.manual, "warning")
                return
            end
            local remote = getRemote(p)
            if not remote then
                notify("Event Intelligence", "Remote não encontrado agora. Nada foi enviado.", "warning")
                return
            end
            if os.clock() - lastSend < 0.1 then
                notify("Event Intelligence", "Aguarde um instante entre os envios.", "warning")
                return
            end
            local args, bad, why = buildArgs(p)
            if not args then
                notify("Event Intelligence", "Nada foi enviado. Argumento #" .. bad .. ": " .. tostring(why), "warning")
                return
            end
            lastSend = os.clock()
            if remote:IsA("RemoteFunction") then
                if p.invoking then
                    notify("Event Intelligence", "Ainda aguardando a resposta do envio anterior.", "warning")
                    return
                end
                p.invoking = true
                task.spawn(function()
                    sending = true
                    local ok, res = pcall(function()
                        return remote:InvokeServer(table.unpack(args, 1, p.n))
                    end)
                    sending = false
                    p.invoking = false
                    if ok then
                        Win:Log("INFO", "Retorno de " .. remote.Name, showValue(res))
                    else
                        Win:Log("ERROR", "InvokeServer falhou em " .. remote.Name, tostring(res))
                    end
                end)
                notify("Event Intelligence", "InvokeServer enviado para " .. remote.Name .. ".", "success")
            else
                sending = true
                local ok, err = pcall(function()
                    remote:FireServer(table.unpack(args, 1, p.n))
                end)
                sending = false
                if ok then
                    notify("Event Intelligence", "Enviado para " .. remote.Name .. " (o efeito depende do servidor).", "success")
                else
                    notify("Event Intelligence", "Falha ao enviar: " .. tostring(err), "error")
                end
            end
        end

        --// ---------------------------------------------------------- 8) INTERFACE
        local sec = main:AddSubSection("🧠 RN TEAM · Event Intelligence", false)
        local selected -- perfil exibido
        local buildPanel, applyEnabled
        local function playerOptions(withOriginal)
            local out = {}
            if withOriginal then
                out[#out + 1] = ORIGINAL_OPT
            end
            out[#out + 1] = "Eu"
            local names = {}
            for _, pl in ipairs(Players:GetPlayers()) do
                if pl ~= LocalPlayer then
                    names[#names + 1] = pl.Name
                end
            end
            table.sort(names)
            for _, nm in ipairs(names) do
                out[#out + 1] = nm
            end
            return out
        end

        local function headerText(p)
            local lines = {}
            if p.pathOnly and p.learning then
                lines[1] = "Remote: " .. tostring(p.key)
                if p.remote then
                    lines[2] = "🧲 APRENDENDO: faça a ação no jogo uma vez (ex.: usar o item). A 1ª chamada real será lida e os argumentos aparecem aqui, sozinhos."
                else
                    lines[2] = "🧲 AGUARDANDO O REMOTE: ele não existe agora (o item pode não estar no Backpack/Character). Assim que aparecer, passa a ser observado."
                end
                return table.concat(lines, "\n")
            end
            lines[#lines + 1] = "Remote: " .. tostring(p.key) .. " · " .. p.method .. " · " .. p.n .. " argumento(s)"
            if p.manual then
                lines[#lines + 1] = "⚠ PRECISA DE ANÁLISE MANUAL: " .. p.manual .. ". O evento foi mantido intacto e não será enviado."
            end
            for i, s in ipairs(p.slots) do
                local conf = s.analysis.conf
                if s.typeVaries then
                    conf = "baixa"
                end
                lines[#lines + 1] = "#" .. i .. " [" .. s.analysis.kind .. "] " .. CONF_TXT[conf] .. " — " .. s.analysis.reason
                    .. (s.typeVaries and " · o tipo varia entre chamadas observadas" or "")
                    .. (hintFor(s.original) and (" · " .. hintFor(s.original)) or "")
            end
            for _, nt in ipairs(p.notes) do
                lines[#lines + 1] = "ℹ " .. nt
            end
            return table.concat(lines, "\n")
        end

        local function observedText(p)
            local o = p.obs
            local lines = {"Monitoramento: " .. monitorStatus(p)}
            if o.count > 0 then
                local age = o.last and math.floor(os.clock() - o.last) or 0
                lines[#lines + 1] = "Observado: " .. o.count .. " chamada(s); a última há " .. age .. "s; " .. tostring(o.n) .. " argumento(s) na última"
                if o.structChanges and o.structChanges > 0 then
                    lines[#lines + 1] = "A estrutura mudou " .. o.structChanges .. " vez(es) entre chamadas."
                end
                if o.maxN and o.maxN > p.n then
                    lines[#lines + 1] = "Apareceram argumentos além dos colados (até #" .. o.maxN .. "); eles não foram adicionados nem alterados."
                end
                local var = {}
                for i, s in ipairs(p.slots) do
                    if s.varies then
                        var[#var + 1] = "#" .. i .. " (" .. s.changes .. "x)"
                    end
                end
                if #var > 0 then
                    lines[#lines + 1] = "Valores que mudam entre chamadas: " .. table.concat(var, ", ")
                end
                if o.dropped and o.dropped > 0 then
                    lines[#lines + 1] = "Chamadas descartadas por excesso de volume: " .. o.dropped
                end
            elseif enabled and p.monitor then
                lines[#lines + 1] = "Ainda nenhuma chamada observada. Só são vistas as chamadas dos scripts do jogo que passam pelo __namecall."
            end
            return table.concat(lines, "\n")
        end

        local function clearPanel()
            local body = ui.panel._frame
            for _, c in ipairs(body:GetChildren()) do
                if not c:IsA("UIListLayout") then
                    c:Destroy()
                end
            end
            ui.panel._order = 0
            ui.playerDds = {}
            ui.obsLabel = nil
            ui.statusLabel = nil
        end

        function refreshInfo()
            if ui.status then
                if not enabled then
                    ui.status:Set("Desativado. O modo manual continua funcionando normalmente; nada é analisado nem monitorado.")
                else
                    local cap = HAS_HOOK and "monitoramento em tempo real disponível" or "SEM monitoramento em tempo real neste executor (só análise do texto colado)"
                    ui.status:Set("Ativo · " .. #profiles .. " evento(s) analisado(s) · " .. cap)
                end
            end
            if ui.obsLabel and selected then
                ui.obsLabel:Set(observedText(selected))
            end
        end

        --// ---------------------------------------------------------- 📥 PASSAR PARA O MANUAL
        -- Traduz o que o Event Intelligence juntou (Remote, chamada, alvo, argumentos) para os campos do modo manual.
        local function segsRelative(inst, anc, prefix)
            local rev, cur = {}, inst
            for _ = 1, 40 do
                if cur == anc then
                    local out = {}
                    for _, s in ipairs(prefix) do
                        out[#out + 1] = s
                    end
                    for i = #rev, 1, -1 do
                        out[#out + 1] = rev[i]
                    end
                    return out
                end
                if cur == nil or cur == game then
                    return nil
                end
                rev[#rev + 1] = cur.Name
                cur = cur.Parent
            end
            return nil
        end

        local function manualPathFor(p)
            if p.path and p.path.segs and #p.path.segs > 0 then
                return table.concat(p.path.segs, ".")
            end
            local r = p.remote
            if r and r.Parent then
                local segs = segsRelative(r, LocalPlayer, {"Players", "LocalPlayer"})
                if not segs and LocalPlayer.Character then
                    segs = segsRelative(r, LocalPlayer.Character, {"Players", "LocalPlayer", "Character"})
                end
                if not segs then
                    local pf = pathFromInstance(r)
                    segs = pf and pf.segs
                end
                if segs then
                    return table.concat(segs, ".")
                end
            end
            return nil
        end

        local function dirTextOf(inst)
            local par = inst.Parent
            if not par then
                return nil
            end
            local pf = pathFromInstance(par)
            if pf then
                return table.concat(pf.segs, ".")
            end
            return nil
        end

        local AIM_PARTS = {"HumanoidRootPart", "Head", "Torso", "UpperTorso"}
        local NEAR = 15 -- até quantos studs uma coordenada ainda é considerada "a posição de alguém"

        local function manualSpecFor(p)
            local spec = {args = {}, notes = {}}
            local skipped = {}
            local tType, tName, tDir, tObj
            local pending = {} -- Vector3/CFrame: resolvidos depois, quando o alvo já é conhecido
            local function skip(i, why)
                skipped[#skipped + 1] = "#" .. i .. " (" .. why .. ")"
            end
            local function useArg(i, name)
                for _, a in ipairs(spec.args) do
                    if a == name then
                        skip(i, "'" .. name .. "' repetido")
                        return false
                    end
                end
                spec.args[#spec.args + 1] = name
                return true
            end
            local function useTarget(i, ttype, name, dir, obj)
                if tType and (tType ~= ttype or tName ~= name) then
                    skip(i, "alvo diferente do primeiro")
                    return false
                end
                tType, tName, tDir, tObj = ttype, name, dir, obj
                return true
            end
            local function handleSlot(i, d)
                local t = d.t
                if t == "instance" then
                    local inst, plr, asChar
                    if d.dyn == "player" then
                        local f = (d.who == "@me") and LocalPlayer or Players:FindFirstChild(d.who)
                        if not (f and f:IsA("Player")) then
                            return skip(i, "jogador '" .. tostring(d.who) .. "' não está no servidor")
                        end
                        plr, asChar = f, d.as == "character"
                    else
                        inst = d.inst
                        if not (inst and (inst == game or inst.Parent)) and d.path then
                            inst = resolveStrict(d.path)
                        end
                        if not inst then
                            return skip(i, "objeto não encontrado agora")
                        end
                        if inst:IsA("Player") then
                            plr = inst
                        elseif inst:IsA("Model") then
                            local owner = Players:GetPlayerFromCharacter(inst)
                            if owner then
                                plr, asChar = owner, true
                            end
                        elseif inst:IsA("BasePart") and inst.Name == "HumanoidRootPart" then
                            local mdl = inst:FindFirstAncestorOfClass("Model")
                            local owner = mdl and Players:GetPlayerFromCharacter(mdl)
                            if owner then
                                if useTarget(i, "Players", owner.Name) then
                                    useArg(i, "HumanoidRootPart")
                                end
                                return
                            end
                        end
                    end
                    if plr then
                        if useTarget(i, "Players", plr.Name) then
                            useArg(i, asChar and "Character" or "Player")
                        end
                        return
                    end
                    if inst:IsA("Model") then
                        local dir = dirTextOf(inst)
                        if not dir then
                            return skip(i, "Model sem pasta conhecida")
                        end
                        local ttype = inst:FindFirstChildOfClass("Humanoid") and "NPCs" or "Models"
                        if useTarget(i, ttype, inst.Name, dir, inst) then
                            useArg(i, "Model")
                        end
                        return
                    end
                    if inst:IsA("BasePart") then
                        local dir = dirTextOf(inst)
                        if not dir then
                            return skip(i, "Part sem pasta conhecida")
                        end
                        if useTarget(i, "Parts", inst.Name, dir, inst) then
                            useArg(i, "Part")
                        end
                        return
                    end
                    return skip(i, inst.ClassName .. " sem equivalente")
                elseif t == "Vector3" or t == "CFrame" then
                    pending[#pending + 1] = {i = i, d = d}
                elseif t == "string" then
                    local f = d.v ~= "" and Players:FindFirstChild(d.v) or nil
                    if f and f:IsA("Player") then
                        if useTarget(i, "Players", f.Name) then
                            useArg(i, "Nome")
                        end
                    elseif spec.text == nil then
                        spec.text = d.v
                        useArg(i, "Texto fixo")
                    else
                        skip(i, "segundo texto")
                    end
                elseif t == "number" then
                    if spec.number == nil then
                        spec.number = d.v
                        useArg(i, "Número fixo")
                    else
                        skip(i, "segundo número")
                    end
                else
                    skip(i, tostring(t) .. " sem equivalente")
                end
            end
            for i = 1, p.n do
                local s = p.slots[i]
                local d = s and slotDesc(p, s)
                if d then
                    local ok, err = pcall(handleSlot, i, d)
                    if not ok then
                        skip(i, "erro ao ler")
                        Win:Log("ERROR", "Event Intelligence: argumento #" .. i .. " não pôde ser passado ao manual", tostring(err))
                    end
                else
                    skip(i, "sem dados")
                end
            end

            --// COORDENADAS AUTOMÁTICAS: nada de número fixo. Descobre de onde o valor veio
            --// (posição do alvo, minha posição ou direção) e deixa o manual recalcular a cada disparo.
            local function targetModel()
                if tType == "Players" then
                    local pl = (tName == LocalPlayer.Name) and LocalPlayer or Players:FindFirstChild(tName)
                    return (pl and pl:IsA("Player")) and pl.Character or nil
                end
                return tObj
            end
            local function candidates(tm)
                local out, seen = {}, {}
                if not tm then
                    return out
                end
                if tm:IsA("BasePart") then
                    out[1] = {name = tm.Name, part = tm}
                    return out
                end
                for _, nm in ipairs(AIM_PARTS) do
                    local part = getPart(tm, nm, true)
                    if part and not seen[part] then
                        seen[part] = true
                        out[#out + 1] = {name = nm, part = part}
                    end
                end
                return out
            end
            for _, it in ipairs(pending) do
                local i, d = it.i, it.d
                local ok, err = pcall(function()
                    local v = Vector3.new(d.x, d.y, d.z)
                    local me = getRoot()
                    local isDir = d.t == "Vector3" and math.abs(v.Magnitude - 1) < 0.02
                    if not isDir and not tType then
                        -- nenhum alvo nos argumentos: vê se a coordenada é a posição de algum jogador
                        local bestPl, bestD
                        for _, pl in ipairs(Players:GetPlayers()) do
                            if pl ~= LocalPlayer and pl.Character then
                                for _, c in ipairs(candidates(pl.Character)) do
                                    local dd = (c.part.Position - v).Magnitude
                                    if not bestD or dd < bestD then
                                        bestPl, bestD = pl, dd
                                    end
                                end
                            end
                        end
                        if bestPl and bestD <= NEAR and useTarget(i, "Players", bestPl.Name) then
                            spec.notes[#spec.notes + 1] = "alvo detectado pela coordenada #" .. i .. ": " .. bestPl.Name
                        end
                    end
                    local bestC, dT
                    for _, c in ipairs(candidates(targetModel())) do
                        local dd = (c.part.Position - v).Magnitude
                        if not dT or dd < dT then
                            bestC, dT = c, dd
                        end
                    end
                    local dM = me and (me.Position - v).Magnitude or nil
                    if isDir then
                        local best, bestDot = nil, 0.95
                        local function try(src, dir)
                            local dt = dir:Dot(v)
                            if dt > bestDot then
                                best, bestDot = src, dt
                            end
                        end
                        if me then
                            try("LookVector do meu personagem", me.CFrame.LookVector)
                        end
                        if bestC then
                            try("LookVector do alvo", bestC.part.CFrame.LookVector)
                        end
                        if me and bestC then
                            local diff = bestC.part.Position - me.Position
                            if diff.Magnitude > 1e-3 then
                                try("Direção minha → alvo", diff.Unit)
                            end
                        end
                        local exact = best ~= nil
                        if not best then
                            best = (me and bestC) and "Direção minha → alvo" or "LookVector do meu personagem"
                        end
                        local placed
                        if not spec.lookSource then
                            if useArg(i, "LookVector") then
                                spec.lookSource, placed = best, true
                            end
                        elseif not spec.vecSource then
                            if useArg(i, "Vector3") then
                                spec.vecSource, placed = best, true
                            end
                        else
                            skip(i, "vetor de direção extra")
                        end
                        if placed then
                            spec.notes[#spec.notes + 1] = "#" .. i .. " → " .. best .. (exact and "" or " (aprox.)")
                        end
                    else
                        local who, exact
                        if bestC and dT <= NEAR and (not dM or dT <= dM) then
                            who, exact = "target", true
                        elseif dM and dM <= NEAR then
                            who, exact = "me", true
                        elseif bestC then
                            who, exact = "target", false
                        else
                            who, exact = "me", false
                        end
                        if d.t == "CFrame" then
                            local src = (who == "target") and "CFrame do alvo" or "CFrame do meu personagem"
                            if useArg(i, "CFrame") then
                                spec.cfSource = src
                                spec.notes[#spec.notes + 1] = "#" .. i .. " → " .. src .. (exact and "" or " (aprox.)")
                            end
                        else
                            local src = (who == "target") and "Position do alvo" or "Position do meu personagem"
                            local placed
                            if not spec.posSource then
                                if useArg(i, "Position") then
                                    spec.posSource, placed = src, true
                                end
                            elseif not spec.vecSource then
                                if useArg(i, "Vector3") then
                                    spec.vecSource, placed = src, true
                                end
                            else
                                skip(i, "terceira posição")
                            end
                            if placed then
                                if who == "target" and exact and bestC and tType ~= "Parts" and not spec.aimPart then
                                    spec.aimPart = bestC.name
                                end
                                spec.notes[#spec.notes + 1] = "#" .. i .. " → " .. src .. (exact and "" or " (aprox.)")
                            end
                        end
                    end
                end)
                if not ok then
                    skip(i, "erro ao ler")
                    Win:Log("ERROR", "Event Intelligence: coordenada #" .. i .. " não pôde ser automatizada", tostring(err))
                end
            end

            spec.target = tType and {type = tType, name = tName, dir = tDir} or nil
            spec.skipped = skipped
            spec.path = manualPathFor(p)
            spec.kind = p.method
            return spec
        end

        local function toManual(p)
            if p.learning then
                notify("Event Intelligence", "Ainda aprendendo: faça a ação no jogo uma vez para eu ler os argumentos.", "warning")
                return
            end
            local spec = manualSpecFor(p)
            if not spec.path then
                notify("Event Intelligence", "Não consegui descobrir o caminho do Remote deste evento.", "warning")
                return
            end
            EI.toManual(spec)
            Win:Log("INFO", "Event Intelligence → manual: " .. spec.path .. " · " .. tostring(spec.kind), "argumentos: " .. table.concat(spec.args, ", "))
            notify("Event Intelligence", "Passado para o modo manual: caminho, tipo de chamada, alvo e " .. #spec.args .. " argumento(s). Veja em ⚡ Evento / Remote.", "success")
            if #spec.notes > 0 then
                notify("Event Intelligence", "Coordenadas automáticas (seguem o alvo/você em tempo real): " .. table.concat(spec.notes, " · "), "info")
            end
            if #spec.skipped > 0 then
                notify("Event Intelligence", "Sem equivalente no manual: " .. table.concat(spec.skipped, ", ") .. ". Confira antes de executar.", "warning")
            end
        end

        local function slotLabelFor(s)
            local conf = s.analysis.conf
            if s.typeVaries then
                conf = "baixa"
            end
            return "#" .. s.idx .. " " .. s.analysis.kind .. " · " .. CONF_TXT[conf]
        end

        local function addSlotControls(p, s)
            local panel = ui.panel
            local kind = s.analysis.kind
            panel:AddLabel(slotLabelFor(s) .. " — " .. s.analysis.reason)

            if kind == "vector3" or kind == "cframe" then
                local cur = s.override or s.original
                local comps = {x = cur.x, y = cur.y, z = cur.z}
                local function commit()
                    local o = {}
                    for k2, v2 in pairs(s.original) do
                        o[k2] = v2
                    end
                    o.x, o.y, o.z = comps.x, comps.y, comps.z
                    if kind == "cframe" and s.original.comps then
                        local c = {}
                        for i, v2 in ipairs(s.original.comps) do
                            c[i] = v2
                        end
                        c[1], c[2], c[3] = comps.x, comps.y, comps.z
                        o.comps = c
                    end
                    s.override = o
                    s.edited = true
                end
                for _, axis in ipairs({"x", "y", "z"}) do
                    panel:AddInput({
                        Name = "#" .. s.idx .. " · " .. axis:upper(), Numeric = true, Min = -1e9, Max = 1e9,
                        Default = comps[axis], Feature = false,
                        Callback = function(v)
                            comps[axis] = v
                            commit()
                        end,
                    })
                end

            elseif kind == "player" or kind == "character" then
                local who = "@orig"
                local ov = s.override
                if ov and ov.dyn == "player" then
                    who = ov.who
                end
                local default = ORIGINAL_OPT
                if who == "@me" then
                    default = "Eu"
                elseif who ~= "@orig" then
                    default = who
                end
                local dd = panel:AddDropdown({
                    Name = "#" .. s.idx .. (kind == "player" and " jogador" or " personagem de"),
                    Options = playerOptions(true), Default = default, Feature = false,
                    Callback = function(v)
                        if v == nil or v == ORIGINAL_OPT then
                            s.override, s.edited = nil, false
                        else
                            s.override = {t = "instance", dyn = "player", who = (v == "Eu") and "@me" or v, as = kind}
                            s.edited = true
                        end
                    end,
                })
                ui.playerDds[#ui.playerDds + 1] = dd

            elseif kind == "model" or kind == "part" or kind == "instance" or kind == "unresolved" then
                local shown = (s.override and s.override.text) or s.original.text or ""
                local el
                el = panel:AddInput({
                    Name = "#" .. s.idx .. " caminho", Default = shown, Placeholder = "game.Workspace.Objeto", Feature = false,
                    Callback = function(txt)
                        local path = parsePathInput(txt)
                        local inst, why
                        if path then
                            inst, why = resolveStrict(path)
                        end
                        local req = s.analysis.reqClass
                        if inst and (not req or inst:IsA(req)) then
                            s.override = {t = "instance", inst = inst, path = path, text = pathText(path)}
                            s.edited = true
                            notify("Event Intelligence", "Argumento #" .. s.idx .. " agora aponta para " .. inst:GetFullName(), "success")
                        else
                            notify("Event Intelligence", "Caminho não aceito (" .. tostring(why or "tipo incompatível com o original") .. "). Valor anterior mantido.", "warning")
                            el:Set(shown, true)
                        end
                    end,
                })

            elseif kind == "playername" or kind == "userid" then
                local default = ORIGINAL_OPT
                if s.override then
                    for _, pl in ipairs(Players:GetPlayers()) do
                        if (kind == "playername" and pl.Name == s.override.v) or (kind == "userid" and pl.UserId == s.override.v) then
                            default = (pl == LocalPlayer) and "Eu" or pl.Name
                        end
                    end
                end
                local dd = panel:AddDropdown({
                    Name = "#" .. s.idx .. (kind == "playername" and " nome do jogador" or " UserId do jogador"),
                    Options = playerOptions(true), Default = default, Feature = false,
                    Callback = function(v)
                        if v == nil or v == ORIGINAL_OPT then
                            s.override, s.edited = nil, false
                            return
                        end
                        local plr = (v == "Eu") and LocalPlayer or Players:FindFirstChild(v)
                        if not plr or not plr:IsA("Player") then
                            notify("Event Intelligence", "Esse jogador não está mais no servidor. Original mantido.", "warning")
                            s.override, s.edited = nil, false
                            return
                        end
                        if kind == "playername" then
                            s.override = {t = "string", v = plr.Name}
                        else
                            s.override = {t = "number", v = plr.UserId}
                        end
                        s.edited = true
                    end,
                })
                ui.playerDds[#ui.playerDds + 1] = dd

            elseif kind == "coords3" then
                local info = table3(s.original)
                local cur = {info.v[1], info.v[2], info.v[3]}
                local prevOv = s.override and table3(s.override)
                if prevOv then
                    cur = {prevOv.v[1], prevOv.v[2], prevOv.v[3]}
                end
                local function commit()
                    local entries = {}
                    for i = 1, 3 do
                        local key
                        if info.style == "array" then
                            key = {t = "number", v = i}
                        else
                            key = {t = "string", v = info.keys[i]}
                        end
                        entries[i] = {k = key, v = {t = "number", v = cur[i]}}
                    end
                    s.override = {t = "table", entries = entries}
                    s.edited = true
                end
                for i, axis in ipairs({"X", "Y", "Z"}) do
                    panel:AddInput({
                        Name = "#" .. s.idx .. " · " .. axis, Numeric = true, Min = -1e9, Max = 1e9, Default = cur[i], Feature = false,
                        Callback = function(v)
                            cur[i] = v
                            commit()
                        end,
                    })
                end

            elseif kind == "number" then
                panel:AddInput({
                    Name = "#" .. s.idx .. " número", Numeric = true, Min = -1e12, Max = 1e12,
                    Default = (s.override or s.original).v, Feature = false,
                    Callback = function(v)
                        s.override, s.edited = {t = "number", v = v}, true
                    end,
                })
            elseif kind == "string" then
                panel:AddInput({
                    Name = "#" .. s.idx .. " texto", Default = (s.override or s.original).v, Feature = false,
                    Callback = function(v)
                        s.override, s.edited = {t = "string", v = tostring(v)}, true
                    end,
                })
            elseif kind == "boolean" then
                panel:AddToggle({
                    Name = "#" .. s.idx .. " valor", Default = (s.override or s.original).v, Feature = false,
                    Callback = function(v)
                        s.override, s.edited = {t = "boolean", v = v}, true
                    end,
                })
            else
                panel:AddLabel("🔒 #" .. s.idx .. " preservado exatamente como veio; sem controle (análise manual).")
            end

            -- interpretação confirmada pelo usuário (nunca muda o tipo do valor)
            local id = interpFor(s.original)
            if id and (s.original.t == "string" or s.original.t == "number" or s.original.t == "table") then
                local meta = INTERPS[id]
                if meta.need(s.original) then
                    panel:AddDropdown({
                        Name = "#" .. s.idx .. " interpretar como", Feature = false,
                        Options = {"Manter original (padrão)", meta.label},
                        Default = s.interp == id and meta.label or "Manter original (padrão)",
                        Callback = function(v)
                            s.interp = (v == meta.label) and id or nil
                            s.analysis = analyze(s.original, s.interp)
                            s.override, s.edited = nil, false
                            task.defer(buildPanel, p)
                        end,
                    })
                end
            end
        end

        function buildPanel(p)
            clearPanel()
            selected = p
            local panel = ui.panel
            if not p then
                panel:AddLabel("Nenhum evento selecionado. Informe só o caminho e toque em Aprender, ou cole uma chamada do RSpy e toque em Analisar.")
                return
            end
            panel:AddLabel(headerText(p))
            ui.obsLabel = panel:AddLabel(observedText(p))
            panel:AddToggle({
                Name = "Monitorar em tempo real", Default = p.monitor, Feature = false,
                Callback = function(on)
                    p.monitor = on
                    syncWatch()
                    if on and not HAS_HOOK then
                        notify("Event Intelligence", "Este executor não permite observar chamadas do jogo. Só a chamada colada é usada.", "warning")
                    end
                    refreshInfo()
                end,
            })
            panel:AddToggle({
                Name = "Seguir valores observados", Default = p.follow, Feature = false,
                Callback = function(on)
                    p.follow = on
                end,
            })
            panel:AddLabel("'Seguir' usa o último valor observado nos argumentos que você não editou (somente se o tipo for o mesmo). Desligado, vale o valor original colado.")
            for _, s in ipairs(p.slots) do
                addSlotControls(p, s)
            end
            panel:AddButton({Name = "🚀 Enviar uma vez", Callback = function() sendNow(p) end})
            panel:AddButton({Name = "📥 Passar tudo para o manual", Callback = function() toManual(p) end})
            panel:AddButton({Name = "♻️ Zerar aba Evento (como nova)", Callback = function()
                if EI.resetTab then
                    task.spawn(EI.resetTab)
                end
            end})
            -- o resto fica guardado aqui, recolhido
            local adv = panel:AddSubSection("🔧 Avançado", false)
            adv:AddButton({Name = "👁 Pré-visualizar argumentos", Callback = function() previewArgs(p) end})
            if p.pathOnly then
                adv:AddButton({Name = "🧲 Reaprender na próxima chamada", Callback = function()
                    p.learning, p.learned = true, false
                    p.slots, p.n, p.notes, p.manual = {}, 0, {}, nil
                    p.lastObs, p.obs = nil, {count = 0}
                    p.sig = signature(p)
                    syncWatch()
                    ui.rebuildList(p)
                    refreshInfo()
                    notify("Event Intelligence", "Faça a ação no jogo uma vez: a próxima chamada real redefine os argumentos.", "info")
                end})
            end
            adv:AddButton({Name = "🔄 Atualizar (Remote e jogadores)", Callback = function()
                local r = getRemote(p)
                local rebuild = p.learning == true
                if p.manual and p.manualRemote and r then
                    if (p.method == "FireServer" and r:IsA("RemoteEvent")) or (p.method == "InvokeServer" and r:IsA("RemoteFunction")) then
                        p.manual, p.manualRemote = nil, nil
                        rebuild = true
                    end
                end
                for _, s in ipairs(p.slots) do
                    if s.analysis.kind == "unresolved" and s.original.path then
                        local inst, why = resolveStrict(s.original.path)
                        s.original.inst, s.original.err = inst, why
                        if inst then
                            s.analysis = analyze(s.original, nil)
                            rebuild = true
                        end
                    end
                end
                if rebuild then
                    task.defer(buildPanel, p)
                end
                syncWatch()
                for _, dd in ipairs(ui.playerDds) do
                    dd:Refresh(playerOptions(true))
                end
                refreshInfo()
            end})
            adv:AddButton({Name = "↩ Restaurar valores originais", Callback = function()
                for _, s in ipairs(p.slots) do
                    s.override, s.edited = nil, false
                end
                p.follow = false
                task.defer(buildPanel, p)
                notify("Event Intelligence", "Valores originais restaurados.", "info")
            end})
            adv:AddButton({Name = "💾 Salvar interpretações confirmadas", Callback = function()
                local rec, count = {}, 0
                for i, s in ipairs(p.slots) do
                    if s.interp then
                        rec[tostring(i)] = {interp = s.interp, t = typeTag(s.original)}
                        count = count + 1
                    end
                end
                if count == 0 then
                    notify("Event Intelligence", "Não há interpretação confirmada por você neste evento.", "warning")
                    return
                end
                saved[p.key] = {sig = p.sig, slots = rec}
                if writeSaved() then
                    notify("Event Intelligence", count .. " interpretação(ões) salva(s). Só serão reaplicadas se a estrutura for idêntica.", "success")
                else
                    notify("Event Intelligence", "O executor não permite salvar arquivos; vale só nesta sessão.", "warning")
                end
            end})
            adv:AddButton({Name = "🧽 Esquecer interpretação salva", Callback = function()
                if saved[p.key] then
                    saved[p.key] = nil
                    writeSaved()
                    notify("Event Intelligence", "Interpretação salva removida.", "info")
                else
                    notify("Event Intelligence", "Não havia interpretação salva para este evento.", "info")
                end
            end})
            adv:AddButton({Name = "🗑 Remover este evento da análise", Callback = function()
                for i, q in ipairs(profiles) do
                    if q == p then
                        table.remove(profiles, i)
                        break
                    end
                end
                syncWatch()
                ui.rebuildList(nil)
                refreshInfo()
            end})
        end

        local function rebuildList(pick)
            byLabel = {}
            local labels = {}
            for _, p in ipairs(profiles) do
                local base, label, k = profileLabel(p), nil, 1
                label = base
                while byLabel[label] do
                    k = k + 1
                    label = base .. " #" .. k
                end
                p.label = label
                byLabel[label] = p
                labels[#labels + 1] = label
            end
            ui.list:Refresh(labels)
            if pick and pick.label then
                ui.list:Set(pick.label, true)
            end
            buildPanel(pick)
        end
        ui.rebuildList = rebuildList

        -- chamado quando um perfil "só caminho" acaba de aprender a estrutura
        onLearned = function(p)
            local short1 = tostring(p.key):match("([^%.]+)$") or tostring(p.key)
            Win:Log("INFO", "Event Intelligence: '" .. short(p.key, 50) .. "' aprendido (" .. p.n .. " argumento(s), " .. p.method .. ")")
            notify("Event Intelligence", "Aprendi " .. short(short1, 24) .. ": " .. p.n .. " argumento(s). Os controles estão no painel; 'Enviar uma vez' repete a chamada mais recente.", "success")
            rebuildList(selected or p)
            refreshInfo()
        end

        local function learnByPath(text)
            text = tostring(text or "")
            if trim(text) == "" then
                notify("Event Intelligence", "Digite o caminho do evento primeiro.", "warning")
                return
            end
            if not HAS_HOOK then
                notify("Event Intelligence", "Este executor não oferece hookmetamethod/getnamecallmethod, então não dá para aprender só pelo caminho. Cole a chamada do RSpy.", "warning")
                return
            end
            if not enabled then -- o usuário só precisa do caminho: liga sozinho
                applyEnabled(true)
                if Win.Elements.ev_ei_on then
                    Win.Elements.ev_ei_on:Set(true, true)
                end
            end
            local okP, p, err = pcall(profileFromPath, text)
            if not okP then
                Win:Log("ERROR", "Event Intelligence: falha ao preparar o caminho", tostring(p))
                notify("Event Intelligence", "Não foi possível usar esse caminho. Nada foi alterado.", "error")
                return
            end
            if not p then
                notify("Event Intelligence", tostring(err), "warning")
                return
            end
            for _, q in ipairs(profiles) do
                if q.callKey == p.callKey then
                    rebuildList(q)
                    notify("Event Intelligence", "Esse caminho já está na lista (configurações mantidas). Use 'Reaprender' para ler a estrutura de novo.", "info")
                    return
                end
            end
            if #profiles >= MAX_PROFILES then
                notify("Event Intelligence", "Limite de " .. MAX_PROFILES .. " eventos analisados; remova algum para adicionar.", "warning")
                return
            end
            profiles[#profiles + 1] = p
            rebuildList(p)
            syncWatch()
            refreshInfo()
            if p.remote then
                notify("Event Intelligence", "Observando " .. p.remote.Name .. ". Faça a ação no jogo uma vez (ex.: usar o item) para eu aprender os argumentos.", "info")
            else
                notify("Event Intelligence", "Remote não encontrado agora; vou procurar de novo sozinho. Ele precisa existir para ser observado.", "warning")
            end
        end

        local function analyzeText(text)
            text = tostring(text or "")
            if trim(text) == "" then
                notify("Event Intelligence", "Cole uma chamada do RSpy antes de analisar.", "warning")
                return
            end
            if #text > MAX_SRC then
                notify("Event Intelligence", "Texto grande demais para análise segura. Nada foi alterado.", "warning")
                return
            end
            local result, err = parseRSpy(text)
            if not result then
                Win:Log("WARNING", "Event Intelligence: não foi possível ler o texto", tostring(err))
                notify("Event Intelligence", "Texto não pôde ser lido (" .. tostring(err) .. "). Nada foi alterado; faça a análise manual.", "warning")
                return
            end
            if #result.calls == 0 then
                notify("Event Intelligence", "Nenhuma chamada FireServer/InvokeServer reconhecida. O texto foi mantido intacto; use o modo manual.", "warning")
                return
            end
            local added, same, last = 0, 0, nil
            for _, call in ipairs(result.calls) do
                local okP, p = pcall(profileFromCall, call)
                if not okP then
                    Win:Log("ERROR", "Event Intelligence: falha ao analisar uma chamada (mantida intacta)", tostring(p))
                else
                    local dup
                    for _, q in ipairs(profiles) do
                        if q.callKey == p.callKey then
                            dup = q
                            break
                        end
                    end
                    if dup then
                        same = same + 1
                        last = dup
                    elseif #profiles >= MAX_PROFILES then
                        notify("Event Intelligence", "Limite de " .. MAX_PROFILES .. " eventos analisados; remova algum para adicionar.", "warning")
                        break
                    else
                        for _, nt in ipairs(result.notes) do
                            p.notes[#p.notes + 1] = nt
                        end
                        applySaved(p)
                        profiles[#profiles + 1] = p
                        added = added + 1
                        last = p
                    end
                end
            end
            rebuildList(last)
            syncWatch()
            refreshInfo()
            local manual = 0
            for _, p in ipairs(profiles) do
                if p.manual then
                    manual = manual + 1
                end
            end
            notify("Event Intelligence", string.format("%d evento(s) novo(s), %d já analisado(s) (configurações mantidas). %d precisam de análise manual.", added, same, manual), added > 0 and "success" or "info")
        end

        --// controles estáticos
        sec:AddToggle({
            Name = "Ativar Event Intelligence", Flag = "ev_ei_on", Default = false, Feature = false,
            Callback = function(on)
                task.defer(function()
                    applyEnabled(on)
                end)
            end,
        })
        ui.status = sec:AddLabel("Desativado. O modo manual continua funcionando normalmente; nada é analisado nem monitorado.")
        sec:AddLabel("🧲 MODO SÓ CAMINHO: informe apenas o caminho do evento. O Event Intelligence passa a observar esse evento e aprende os argumentos sozinho na 1ª chamada real do jogo (use o item/faça a ação uma vez). Não precisa colar nada do RSpy. Se a Tool estiver no Backpack ou no Character, ele acha nos dois.")
        local pathBox = sec:AddInput({
            Name = "Caminho do evento", Flag = "ev_ei_path", Default = "",
            Placeholder = "Players.LocalPlayer.Backpack.DefaultSlap.Event", Feature = false,
        })
        sec:AddButton({Name = "🧲 Aprender só pelo caminho", Callback = function()
            learnByPath(pathBox:Get())
        end})
        sec:AddLabel("Ou, se preferir, cole abaixo a chamada completa do RSpy.")
        sec:AddLabel("Cole abaixo a chamada copiada do RSpy. O texto é apenas lido, nunca executado. O que não for reconhecido com segurança fica intacto e marcado para análise manual. Só são acompanhadas chamadas que o executor consegue observar.")

        local inputRow = sec:_row(150)
        local holder = new("ScrollingFrame", {
            Position = UDim2.fromOffset(6, 6), Size = UDim2.new(1, -12, 1, -12), BackgroundColor3 = Theme.Background,
            BorderSizePixel = 0, ScrollBarThickness = 4, CanvasSize = UDim2.new(0, 0, 0, 0),
            AutomaticCanvasSize = Enum.AutomaticSize.Y, ClipsDescendants = true,
        }, inputRow)
        corner(holder, 6)
        local box = new("TextBox", {
            Size = UDim2.new(1, -8, 0, 130), AutomaticSize = Enum.AutomaticSize.Y, BackgroundTransparency = 1,
            MultiLine = true, ClearTextOnFocus = false, TextWrapped = true, Font = Enum.Font.Code, TextSize = 12,
            TextColor3 = Theme.Text, PlaceholderText = "Cole aqui a chamada do RSpy...", PlaceholderColor3 = Theme.SubText,
            TextXAlignment = Enum.TextXAlignment.Left, TextYAlignment = Enum.TextYAlignment.Top, Text = "",
        }, holder)
        padding(box, 6, 6, 6, 6)

        sec:AddButton({Name = "🔍 Analisar chamada colada", Callback = function()
            if not enabled then
                notify("Event Intelligence", "Ative o Event Intelligence primeiro.", "warning")
                return
            end
            analyzeText(box.Text)
        end})
        sec:AddButton({Name = "🧹 Limpar caixa de texto", Callback = function()
            box.Text = ""
        end})
        ui.list = sec:AddDropdown({
            Name = "Evento analisado", Options = {}, Placeholder = "Nenhum evento analisado", Feature = false,
            Callback = function(v)
                buildPanel(v and byLabel[v] or nil)
            end,
        })
        ui.panel = sec:AddSubSection("🎛 Controles do evento selecionado", true)
        buildPanel(nil)

        function applyEnabled(on)
            enabled = on == true
            if enabled then
                loadSaved()
            end
            syncWatch()
            refreshInfo()
            Win:Log("INFO", enabled and "Event Intelligence ativado" or "Event Intelligence desativado (configurações preservadas)")
        end

        local refreshPending = false
        local function playersChanged()
            if refreshPending then
                return
            end
            refreshPending = true
            task.delay(0.4, function()
                refreshPending = false
                for _, dd in ipairs(ui.playerDds) do
                    pcall(dd.Refresh, dd, playerOptions(true))
                end
            end)
        end
        Win:Track(Players.PlayerAdded:Connect(playersChanged))
        Win:Track(Players.PlayerRemoving:Connect(playersChanged))

        -- perfis "só caminho": religa o Remote quando a Tool é recriada (respawn) ou aparece depois
        task.spawn(function()
            while Win:IsAlive() do
                task.wait(2)
                if enabled then
                    local changed = false
                    for _, p in ipairs(profiles) do
                        if p.pathOnly and not (p.remote and p.remote.Parent) then
                            local before = p.remote
                            local r = getRemote(p)
                            if r then
                                if p.learning then
                                    p.method = remoteKind(r)
                                end
                                changed = true
                            elseif before then
                                changed = true
                            end
                        end
                    end
                    if changed then
                        pcall(syncWatch)
                        pcall(refreshInfo)
                        if selected and selected.pathOnly and selected.learning then
                            pcall(buildPanel, selected)
                        end
                    end
                end
            end
        end)

        -- usado pelo botão "Zerar aba Evento": limpa eventos analisados, caixas de texto e desliga o Event Intelligence
        EI.reset = function()
            for i = #profiles, 1, -1 do
                table.remove(profiles, i)
            end
            box.Text = ""
            pcall(pathBox.Set, pathBox, "", true)
            applyEnabled(false)
            if Win.Elements.ev_ei_on then
                pcall(Win.Elements.ev_ei_on.Set, Win.Elements.ev_ei_on, false, true)
            end
            syncWatch()
            ui.rebuildList(nil)
            refreshInfo()
        end

        Win:OnDestroy(function()
            hookState.handler = nil
            watched, watchedCount = {}, 0
            queue, qn = {}, 0
            enabled = false
        end)
    end)()

    Win:OnDestroy(function()
        session.stop = true
        stopLoop("event")
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
        cam_fov_on = "camfov", zoom_on = "zoom", antiui = "antiui", fxclean = "fxclean",
        ia_loop_interact = "ia_interact", ia_loop_collect = "ia_collect", ia_loop_tp = "ia_tp",
        route_rec = "rrec", route_play = "rplay", ev_loop = "event",
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
