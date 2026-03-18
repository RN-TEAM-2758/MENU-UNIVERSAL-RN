local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")
local RunService = game:GetService("RunService")
local Lighting = game:GetService("Lighting")
local LocalPlayer = Players.LocalPlayer

local Theme = {
    Main = Color3.fromRGB(15, 15, 22),
    Secondary = Color3.fromRGB(25, 25, 38),
    Accent = Color3.fromRGB(0, 255, 150),
    Text = Color3.fromRGB(240, 240, 240),
    Button = Color3.fromRGB(35, 35, 45),
    Hover = Color3.fromRGB(50, 50, 65),
    Selected = Color3.fromRGB(0, 180, 100)
}

local DropdownSignals = {}

local function GetPathFromString(str)
    local success, result = pcall(function()
        local path = game
        for segment in string.gmatch(str, "[^%.]+") do
            path = path[segment]
        end
        return path
    end)
    return success and result or nil
end

local function EvaluatePath(pathStr)
    if pathStr == "" then return nil end
    local success, result = pcall(function()
        local func = loadstring("return " .. pathStr)
        if func then return func() end
    end)
    return success and result or nil
end

local ScreenGui = Instance.new("ScreenGui", LocalPlayer:WaitForChild("PlayerGui"))
ScreenGui.Name = "RN_TEAM"
ScreenGui.ResetOnSpawn = false

local MainFrame = Instance.new("Frame", ScreenGui)
MainFrame.Size = UDim2.new(0, 550, 0, 420)
MainFrame.Position = UDim2.new(0.5, -275, 0.5, -210)
MainFrame.BackgroundColor3 = Theme.Main
MainFrame.Visible = false
MainFrame.ClipsDescendants = false
Instance.new("UICorner", MainFrame).CornerRadius = UDim.new(0, 10)

local SideBar = Instance.new("Frame", MainFrame)
SideBar.Size = UDim2.new(0, 150, 1, 0)
SideBar.BackgroundColor3 = Theme.Secondary
Instance.new("UICorner", SideBar).CornerRadius = UDim.new(0, 10)

local SideTitle = Instance.new("TextLabel", SideBar)
SideTitle.Size = UDim2.new(1, 0, 0, 60); SideTitle.Text = "RN TEAM"; SideTitle.Font = Enum.Font.GothamBold
SideTitle.TextColor3 = Theme.Accent; SideTitle.TextSize = 22; SideTitle.BackgroundTransparency = 1

local TabContainer = Instance.new("Frame", SideBar)
TabContainer.Size = UDim2.new(1, 0, 1, -70); TabContainer.Position = UDim2.new(0, 0, 0, 60); TabContainer.BackgroundTransparency = 1
Instance.new("UIListLayout", TabContainer).Padding = UDim.new(0, 5)
TabContainer.UIListLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center

local Pages = Instance.new("Frame", MainFrame)
Pages.Size = UDim2.new(1, -170, 1, -20); Pages.Position = UDim2.new(0, 160, 0, 10); Pages.BackgroundTransparency = 1
Pages.ClipsDescendants = true

local FloatingBtn = Instance.new("TextButton", ScreenGui)
FloatingBtn.Size = UDim2.new(0, 55, 0, 55)
-- AQUIIII: Se quiser mudar a altura do botão, mude o 0.1 abaixo. Menor = mais alto.
FloatingBtn.Position = UDim2.new(0.05, 0, 0, 0) 
FloatingBtn.BackgroundColor3 = Theme.Accent; FloatingBtn.Text = "RN"; FloatingBtn.Font = Enum.Font.GothamBold
FloatingBtn.TextColor3 = Theme.Main; FloatingBtn.TextSize = 20; Instance.new("UICorner", FloatingBtn).CornerRadius = UDim.new(1, 0)

local function CloseAllDropdowns()
    for _, func in pairs(DropdownSignals) do func() end
end

function CreateSection(parent, text)
    local sectionFrame = Instance.new("Frame", parent)
    sectionFrame.Size = UDim2.new(0.98, 0, 0, 40)
    sectionFrame.BackgroundColor3 = Theme.Secondary
    sectionFrame.ClipsDescendants = true
    Instance.new("UICorner", sectionFrame).CornerRadius = UDim.new(0, 8)
    
    local sectionBtn = Instance.new("TextButton", sectionFrame)
    sectionBtn.Size = UDim2.new(1, 0, 0, 40)
    sectionBtn.BackgroundColor3 = Theme.Button
    sectionBtn.Text = "▼ " .. text
    sectionBtn.TextColor3 = Theme.Accent
    sectionBtn.Font = Enum.Font.GothamBold
    sectionBtn.TextSize = 14
    Instance.new("UICorner", sectionBtn).CornerRadius = UDim.new(0, 8)

    local container = Instance.new("Frame", sectionFrame)
    container.Name = "Container"
    container.Position = UDim2.new(0, 0, 0, 45)
    container.Size = UDim2.new(1, 0, 0, 0)
    container.BackgroundTransparency = 1
    local layout = Instance.new("UIListLayout", container)
    layout.Padding = UDim.new(0, 8)
    layout.HorizontalAlignment = Enum.HorizontalAlignment.Center

    local isOpen = false
    local function UpdateSize()
        local targetSize = isOpen and (layout.AbsoluteContentSize.Y + 55) or 40
        TweenService:Create(sectionFrame, TweenInfo.new(0.3), {Size = UDim2.new(0.98, 0, 0, targetSize)}):Play()
    end

    sectionBtn.MouseButton1Click:Connect(function()
        isOpen = not isOpen
        sectionBtn.Text = (isOpen and "▲ " or "▼ ") .. text
        UpdateSize()
    end)
    layout:GetPropertyChangedSignal("AbsoluteContentSize"):Connect(function()
        if isOpen then UpdateSize() end
    end)
    return container
end

local function CreatePage(name)
    local page = Instance.new("ScrollingFrame", Pages)
    page.Name = name; page.Size = UDim2.new(1, 0, 1, 0); page.BackgroundTransparency = 1
    page.Visible = false; page.ScrollBarThickness = 0
    page.CanvasSize = UDim2.new(0,0,0,0); page.AutomaticCanvasSize = Enum.AutomaticSize.Y
    local layout = Instance.new("UIListLayout", page)
    layout.Padding = UDim.new(0, 10); layout.HorizontalAlignment = Enum.HorizontalAlignment.Center
    return page
end

local function AddTab(name, pageObj)
    local btn = Instance.new("TextButton", TabContainer)
    btn.Size = UDim2.new(0.9, 0, 0, 35); btn.BackgroundColor3 = Theme.Button; btn.Text = name; btn.TextColor3 = Theme.Text
    Instance.new("UICorner", btn).CornerRadius = UDim.new(0, 6)
    btn.MouseButton1Click:Connect(function()
        CloseAllDropdowns()
        for _, p in pairs(Pages:GetChildren()) do if p:IsA("ScrollingFrame") then p.Visible = false end end
        pageObj.Visible = true
    end)
end

function CreateButton(parent, text, callback)
    local btn = Instance.new("TextButton", parent)
    btn.Size = UDim2.new(0.95, 0, 0, 35); btn.BackgroundColor3 = Theme.Button; btn.Text = text
    btn.TextColor3 = Theme.Text; btn.Font = Enum.Font.GothamBold; btn.TextSize = 13
    Instance.new("UICorner", btn).CornerRadius = UDim.new(0, 8)
    btn.MouseButton1Click:Connect(callback)
    return btn
end

function CreateToggle(parent, text, default, callback)
    local tFrame = Instance.new("TextButton", parent)
    tFrame.Size = UDim2.new(0.95, 0, 0, 35); tFrame.BackgroundColor3 = Theme.Button; tFrame.Text = "  " .. text
    tFrame.TextColor3 = Theme.Text; tFrame.TextXAlignment = Enum.TextXAlignment.Left; tFrame.Font = Enum.Font.Gotham; tFrame.TextSize = 13
    Instance.new("UICorner", tFrame).CornerRadius = UDim.new(0, 8)
    local ind = Instance.new("Frame", tFrame)
    ind.Size = UDim2.new(0, 26, 0, 14); ind.Position = UDim2.new(1, -35, 0.5, -7); ind.BackgroundColor3 = default and Theme.Accent or Color3.fromRGB(60,60,70)
    Instance.new("UICorner", ind).CornerRadius = UDim.new(1, 0)
    local state = default
    tFrame.MouseButton1Click:Connect(function()
        state = not state
        ind.BackgroundColor3 = state and Theme.Accent or Color3.fromRGB(60,60,70)
        callback(state)
    end)
end

function CreateTextBox(parent, text, placeholder, callback)
    local base = Instance.new("Frame", parent)
    base.Size = UDim2.new(0.95, 0, 0, 35); base.BackgroundTransparency = 1
    local label = Instance.new("TextLabel", base)
    label.Size = UDim2.new(0.4, 0, 1, 0); label.Text = text; label.TextColor3 = Theme.Text; label.BackgroundTransparency = 1; label.TextXAlignment = Enum.TextXAlignment.Left; label.TextSize = 11
    local box = Instance.new("TextBox", base)
    box.Size = UDim2.new(0.55, 0, 0, 28); box.Position = UDim2.new(0.45, 0, 0.5, -14); box.BackgroundColor3 = Theme.Button
    box.Text = ""; box.PlaceholderText = placeholder; box.TextColor3 = Theme.Text; box.Font = Enum.Font.Gotham; box.TextSize = 12
    box.ClearTextOnFocus = false
    Instance.new("UICorner", box).CornerRadius = UDim.new(0, 6)
    box.FocusLost:Connect(function(enter) if enter then callback(box.Text) end end)
    return box
end

-- Modificado para suportar Multi-Seleção e botão ALL
function CreateDropdown(parent, text, options, callback, isMulti)
    local dropContainer = Instance.new("Frame", parent)
    dropContainer.Size = UDim2.new(0.95, 0, 0, 35); dropContainer.BackgroundTransparency = 1; dropContainer.ZIndex = 20
    local dropBtn = Instance.new("TextButton", dropContainer)
    dropBtn.Size = UDim2.new(1, 0, 0, 35); dropBtn.BackgroundColor3 = Theme.Button; dropBtn.Text = text .. " : Selecionar"
    dropBtn.TextColor3 = Theme.Text; dropBtn.ZIndex = 21; Instance.new("UICorner", dropBtn).CornerRadius = UDim.new(0, 8)
    local listFrame = Instance.new("ScrollingFrame", dropContainer)
    listFrame.Position = UDim2.new(0, 0, 0, 40); listFrame.Size = UDim2.new(1, 0, 0, 0); listFrame.BackgroundColor3 = Theme.Secondary
    listFrame.Visible = false; listFrame.ZIndex = 30; listFrame.BorderSizePixel = 0; listFrame.ScrollBarThickness = 0
    Instance.new("UIListLayout", listFrame)
    
    local isOpen = false
    local selectedItems = {}

    local function toggle(forceClose)
        isOpen = forceClose ~= nil and forceClose or not isOpen
        listFrame.Visible = isOpen
        local itemCount = #listFrame:GetChildren() - 1 -- -1 for UIListLayout
        local listHeight = isOpen and math.min(itemCount*32, 130) or 0
        listFrame.Size = UDim2.new(1, 0, 0, listHeight)
        dropContainer.Size = UDim2.new(0.95, 0, 0, 35 + (isOpen and (listHeight + 5) or 0))
    end
    table.insert(DropdownSignals, function() toggle(false) end)
    dropBtn.MouseButton1Click:Connect(function() toggle() end)
    
    local function UpdateOptions(newList)
        for _, v in pairs(listFrame:GetChildren()) do if v:IsA("TextButton") then v:Destroy() end end
        
        -- RN TEAM
        if isMulti then
            table.insert(newList, 1, "ALL")
        end

        for _, opt in pairs(newList) do
            local o = Instance.new("TextButton", listFrame)
            o.Size = UDim2.new(1, 0, 0, 32); o.BackgroundColor3 = Theme.Secondary; o.Text = opt
            o.TextColor3 = Theme.Text; o.TextSize = 14; o.ZIndex = 31; o.Font = Enum.Font.Gotham; o.BorderSizePixel = 0
            
            -- Restaura a cor visual se já estava selecionado
            if table.find(selectedItems, opt) then o.BackgroundColor3 = Theme.Selected end

            o.MouseButton1Click:Connect(function()
                if isMulti then
                    if opt == "ALL" then
                        selectedItems = {"ALL"}
                        for _, btn in pairs(listFrame:GetChildren()) do
                            if btn:IsA("TextButton") then
                                btn.BackgroundColor3 = (btn.Text == "ALL") and Theme.Selected or Theme.Secondary
                            end
                        end
                    else
                        -- Remove ALL if it was selected
                        local allIdx = table.find(selectedItems, "ALL")
                        if allIdx then table.remove(selectedItems, allIdx) end
                        
                        local idx = table.find(selectedItems, opt)
                        if idx then
                            table.remove(selectedItems, idx)
                            o.BackgroundColor3 = Theme.Secondary
                        else
                            table.insert(selectedItems, opt)
                            o.BackgroundColor3 = Theme.Selected
                        end
                        -- Reseta visual do botão ALL
                        for _, btn in pairs(listFrame:GetChildren()) do
                            if btn:IsA("TextButton") and btn.Text == "ALL" then btn.BackgroundColor3 = Theme.Secondary end
                        end
                    end
                    dropBtn.Text = text .. " (" .. #selectedItems .. " selec.)"
                    callback(selectedItems)
                else
                    dropBtn.Text = text .. " : " .. opt
                    callback(opt)
                    toggle(false)
                end
            end)
        end
        listFrame.CanvasSize = UDim2.new(0,0,0,#newList*32)
        if isOpen then toggle(true); toggle() end
    end
    UpdateOptions(options)
    return {UpdateList = UpdateOptions}
end

local PageCombat = CreatePage("Combat")
local PageMove = CreatePage("Move")
local PageWorld = CreatePage("World")
local PageFarm = CreatePage("Farm")
local PageExecutor = CreatePage("Executor")

AddTab("⚔️ Combate", PageCombat)
AddTab("🏃 Movimento", PageMove)
AddTab("🔍 Visual", PageWorld)
AddTab("😏 Farm/Itens", PageFarm)
AddTab("💻 Executor", PageExecutor)

-- ================= ABA EXECUTOR (Sem Sections e com Páginas) =================
local ScriptsDB = {"", "", "", "", "", "", "", "", "", ""}
local CurrentSlot = 1

local ExecNav = Instance.new("Frame", PageExecutor)
ExecNav.Size = UDim2.new(0.95, 0, 0, 35); ExecNav.BackgroundTransparency = 1
local BtnPrev = Instance.new("TextButton", ExecNav)
BtnPrev.Size = UDim2.new(0.2, 0, 1, 0); BtnPrev.BackgroundColor3 = Theme.Button; BtnPrev.Text = "◀️"; BtnPrev.TextColor3 = Theme.Text; Instance.new("UICorner", BtnPrev).CornerRadius = UDim.new(0, 6)
local LblSlot = Instance.new("TextLabel", ExecNav)
LblSlot.Size = UDim2.new(0.5, 0, 1, 0); LblSlot.Position = UDim2.new(0.25, 0, 0, 0); LblSlot.BackgroundTransparency = 1; LblSlot.Text = "Script Slot 1"; LblSlot.TextColor3 = Theme.Text; LblSlot.Font = Enum.Font.GothamBold
local BtnNext = Instance.new("TextButton", ExecNav)
BtnNext.Size = UDim2.new(0.2, 0, 1, 0); BtnNext.Position = UDim2.new(0.8, 0, 0, 0); BtnNext.BackgroundColor3 = Theme.Button; BtnNext.Text = "▶️"; BtnNext.TextColor3 = Theme.Text; Instance.new("UICorner", BtnNext).CornerRadius = UDim.new(0, 6)

local scriptBoxBase = Instance.new("Frame", PageExecutor)
scriptBoxBase.Size = UDim2.new(0.95, 0, 0, 150); scriptBoxBase.BackgroundTransparency = 1
local scriptBox = Instance.new("TextBox", scriptBoxBase)
scriptBox.Size = UDim2.new(1, 0, 1, 0); scriptBox.BackgroundColor3 = Theme.Button; scriptBox.Text = ScriptsDB[1]; scriptBox.PlaceholderText = "-- Cole ou digite aqui"; scriptBox.TextColor3 = Theme.Text; scriptBox.Font = Enum.Font.Code; scriptBox.TextSize = 12; scriptBox.TextXAlignment = Enum.TextXAlignment.Left; scriptBox.TextYAlignment = Enum.TextYAlignment.Top; scriptBox.ClearTextOnFocus = false; scriptBox.MultiLine = true
Instance.new("UICorner", scriptBox).CornerRadius = UDim.new(0, 6)

local function UpdateExecutorUI()
    LblSlot.Text = "Script Slot " .. CurrentSlot
    scriptBox.Text = ScriptsDB[CurrentSlot]
end

BtnPrev.MouseButton1Click:Connect(function()
    if CurrentSlot > 1 then CurrentSlot = CurrentSlot - 1; UpdateExecutorUI() end
end)
BtnNext.MouseButton1Click:Connect(function()
    if CurrentSlot < #ScriptsDB then CurrentSlot = CurrentSlot + 1; UpdateExecutorUI() end
end)

scriptBox:GetPropertyChangedSignal("Text"):Connect(function()
    ScriptsDB[CurrentSlot] = scriptBox.Text
end)

CreateButton(PageExecutor, "Executar", function()
    local code = ScriptsDB[CurrentSlot]
    if code ~= "" then pcall(function() local func = loadstring(code) if func then func() end end) end
end)

local LoopExecSpeed = 1
local LoopExecActive = false
CreateTextBox(PageExecutor, "Delay Loop", "Ex: 1", function(val) local num = tonumber(val) if num then LoopExecSpeed = num end end)
CreateToggle(PageExecutor, "Ativar Loop", false, function(state) LoopExecActive = state end)

-- =================================================================================

local SecHitP = CreateSection(PageCombat, "Hitbox Jogadores")
local HitboxPlayer, HitboxRGB, PlayerHitboxSize, transparency, fixedColor = false, false, 10, 0.5, Color3.new(0, 1, 0)
CreateTextBox(SecHitP, "Tamanho", "", function(v) PlayerHitboxSize = tonumber(v) or 10 end)
CreateToggle(SecHitP, "Hitbox Jogadores", false, function(s) 
    HitboxPlayer = s 
    if not s then for _, p in pairs(Players:GetPlayers()) do if p ~= LocalPlayer and p.Character and p.Character:FindFirstChild("HumanoidRootPart") then local hrp = p.Character.HumanoidRootPart hrp.Size = Vector3.new(2, 2, 1) hrp.Transparency = 1 hrp.CanCollide = true end end end
end)
CreateToggle(SecHitP, "RGB Hitbox Colorido", false, function(s) HitboxRGB = s end)

local SecHitN = CreateSection(PageCombat, "Hitbox NPCs")
local NPCHitboxDir, NPCHitboxSize, NPCHitboxLoop = "workspace.NPCs", 20, false
CreateTextBox(SecHitN, "Diretório NPCs", "workspace.NPCs", function(v) NPCHitboxDir = v end)
CreateTextBox(SecHitN, "Tamanho NPC", "", function(v) NPCHitboxSize = tonumber(v) or 20 end)
CreateToggle(SecHitN, "Hitbox NPCs", false, function(s) NPCHitboxLoop = s end)

local SecAtrib = CreateSection(PageMove, "Atributos Base")
local DesiredSpeed = 16
local DesiredJump = 50

-- Função que aplica os atributos no personagem
local function ApplyStats(character)
    local humanoid = character:WaitForChild("Humanoid")
    humanoid.WalkSpeed = DesiredSpeed
    humanoid.JumpHeight = DesiredJump
end

-- Conecta para aplicar sempre que você renascer
LocalPlayer.CharacterAdded:Connect(ApplyStats)

-- Atualiza as suas TextBoxes para salvarem o valor na variável
CreateTextBox(SecAtrib, "Velocidade", "50", function(val) 
    DesiredSpeed = tonumber(val) or 16
    if LocalPlayer.Character then ApplyStats(LocalPlayer.Character) end
end)

CreateTextBox(SecAtrib, "Pulo", "100", function(val) 
    DesiredJump = tonumber(val) or 50
    if LocalPlayer.Character then ApplyStats(LocalPlayer.Character) end
end)

local SecEspecial = CreateSection(PageMove, "Movimento Especial")
local InfJump = false
CreateToggle(SecEspecial, "Pulo Infinito", false, function(s) InfJump = s end)
local NoclipConn
CreateToggle(SecEspecial, "Noclip", false, function(state)
    if state then NoclipConn = RunService.Stepped:Connect(function() if LocalPlayer.Character then for _, v in pairs(LocalPlayer.Character:GetDescendants()) do if v:IsA("BasePart") and v.CanCollide then v.CanCollide = false end end end end)
    else if NoclipConn then NoclipConn:Disconnect() end end
end)

local SecAmb = CreateSection(PageWorld, "Visual & Ambiente")
local OriginalLighting = {Ambient = Lighting.Ambient, Brightness = Lighting.Brightness, OutdoorAmbient = Lighting.OutdoorAmbient}
CreateToggle(SecAmb, "Fullbright", false, function(state)
    if state then Lighting.Ambient = Color3.new(1, 1, 1) Lighting.OutdoorAmbient = Color3.new(1, 1, 1) Lighting.Brightness = 2
    else Lighting.Ambient = OriginalLighting.Ambient Lighting.OutdoorAmbient = OriginalLighting.OutdoorAmbient Lighting.Brightness = OriginalLighting.Brightness end
end)

local SecESP = CreateSection(PageWorld, "ESP Objetos & Players")
local ESPDir, ESPActive, ESPTags = "workspace.Itens", false, {}

local function AplicarESP(obj)
    if not obj:FindFirstChild("RN_ESP_Tag") then
        local bgui = Instance.new("BillboardGui", obj); bgui.Name = "RN_ESP_Tag"; bgui.AlwaysOnTop = true; bgui.Size = UDim2.new(0, 100, 0, 30); bgui.StudsOffset = Vector3.new(0, 2, 0)
        local text = Instance.new("TextLabel", bgui); text.BackgroundTransparency = 1; text.Size = UDim2.new(1, 0, 1, 0); text.Text = obj.Name; text.TextColor3 = Color3.new(1, 1, 0); text.Font = Enum.Font.SourceSansBold; text.TextSize = 14
        local hl = Instance.new("Highlight", obj); hl.Name = "RN_ESP_HL"; hl.FillColor = Color3.new(1, 1, 0); hl.FillTransparency = 0.5
        table.insert(ESPTags, {obj, bgui, hl})
    end
end

CreateTextBox(SecESP, "Diretório ESP", "workspace.Itens", function(v) ESPDir = v end)
CreateToggle(SecESP, "Ativar ESP Objetos", false, function(s)
    ESPActive = s
    if not s then for _, data in pairs(ESPTags) do if data[2] then data[2]:Destroy() end if data[3] then data[3]:Destroy() end end ESPTags = {} end
end)

local SecTracer = CreateSection(PageWorld, "ESP Jogadores (Linhas & Chams)")
local TracersActive = false
local ChamsActive = false
local Tracers = {}
local CustomESPColor = Color3.new(1, 1, 1)

local function CreateTracer(player)
    if Tracers[player] then return end
    local Tracer = Drawing.new("Line")
    Tracer.Visible = false
    Tracer.Color = CustomESPColor
    Tracer.Thickness = 1
    Tracer.Transparency = 1
    Tracers[player] = Tracer
end

local function RemoveTracer(player)
    if Tracers[player] then
        Tracers[player]:Remove()
        Tracers[player] = nil
    end
end

CreateTextBox(SecTracer, "Cor (Color RGB", "Ex: 255 255 255", function(v)
    local split = string.split(v, " ")
    if #split == 3 then
        local r, g, b = tonumber(split[1]), tonumber(split[2]), tonumber(split[3])
        if r and g and b then CustomESPColor = (r>1 or g>1 or b>1) and Color3.fromRGB(r, g, b) or Color3.new(r, g, b) end
    end
end)

CreateToggle(SecTracer, "Esp linha (Tracers)", false, function(state)
    TracersActive = state
    if not state then for p, t in pairs(Tracers) do t.Visible = false end end
end)

CreateToggle(SecTracer, "Esp Chams (Atravessa Parede)", false, function(state)
    ChamsActive = state
    if not state then
        for _, player in pairs(Players:GetPlayers()) do
            if player.Character and player.Character:FindFirstChild("RN_Chams") then player.Character.RN_Chams.Enabled = false end
        end
    end
end)

Players.PlayerRemoving:Connect(RemoveTracer)

RunService.RenderStepped:Connect(function()
    for _, player in pairs(Players:GetPlayers()) do
        if player ~= LocalPlayer then
            if TracersActive then
                if not Tracers[player] then CreateTracer(player) end
                local Tracer = Tracers[player]
                if player.Character and player.Character:FindFirstChild("HumanoidRootPart") and player.Character:FindFirstChild("Humanoid") and player.Character.Humanoid.Health > 0 then
                    local Vector, OnScreen = workspace.CurrentCamera:WorldToViewportPoint(player.Character.HumanoidRootPart.Position)
                    if OnScreen then
                        local isEnemy = true
                        if LocalPlayer.Team and player.Team then isEnemy = (player.Team ~= LocalPlayer.Team) end
                        if isEnemy then
                            Tracer.From = Vector2.new(workspace.CurrentCamera.ViewportSize.X / 2, 0)
                            Tracer.To = Vector2.new(Vector.X, Vector.Y)
                            Tracer.Color = CustomESPColor
                            Tracer.Visible = true
                        else Tracer.Visible = false end
                    else Tracer.Visible = false end
                else if Tracers[player] then Tracers[player].Visible = false end end
            else if Tracers[player] then Tracers[player].Visible = false end end

            if ChamsActive and player.Name ~= "ninja120p999" then
                if player.Character and player.Character:FindFirstChild("HumanoidRootPart") and player.Character:FindFirstChild("Humanoid") and player.Character.Humanoid.Health > 0 then
                    local cham = player.Character:FindFirstChild("RN_Chams")
                    if not cham then
                        cham = Instance.new("Highlight")
                        cham.Name = "RN_Chams"; cham.Parent = player.Character; cham.FillTransparency = 0.5; cham.OutlineTransparency = 0.2; cham.DepthMode = Enum.HighlightDepthMode.AlwaysOnTop; cham.Adornee = player.Character
                    end
                    cham.Enabled = true; cham.FillColor = CustomESPColor; cham.OutlineColor = CustomESPColor; cham.Adornee = player.Character
                elseif player.Character and player.Character:FindFirstChild("RN_Chams") then player.Character.RN_Chams.Enabled = false end
            elseif player.Character and player.Character:FindFirstChild("RN_Chams") then player.Character.RN_Chams.Enabled = false end
        end
    end
end)

local AntiPurchaseConn
CreateToggle(PageWorld, "fechar tela de compras", false, function(state)
    local pGui = LocalPlayer:WaitForChild("PlayerGui")
    local function limparUI(gui)
        if not state then return end
        if gui.Name == "RN_TEAM" then return end
        pcall(function()
            if gui:IsA("ScreenGui") then
                for _, v in pairs(gui:GetDescendants()) do
                    if (v:IsA("Frame") or v:IsA("ImageLabel")) and v.Visible == true then
                        local size = v.AbsoluteSize; local screen = workspace.CurrentCamera.ViewportSize
                        if size.X > (screen.X * 0.7) and size.Y > (screen.Y * 0.7) then v.Visible = false end
                    end
                    if v:IsA("ImageLabel") or v:IsA("Frame") then
                        local pos = v.AbsolutePosition; local screen = workspace.CurrentCamera.ViewportSize
                        local centroX, centroY = screen.X / 2, screen.Y / 2
                        if math.abs(pos.X + (v.AbsoluteSize.X/2) - centroX) < 100 and math.abs(pos.Y + (v.AbsoluteSize.Y/2) - centroY) < 100 then v.Visible = false end
                    end
                end
            end
        end)
    end
    if state then
        for _, gui in pairs(pGui:GetChildren()) do limparUI(gui) end
        AntiPurchaseConn = pGui.DescendantAdded:Connect(function(obj)
            task.wait(0.5)
            if obj:IsA("ScreenGui") then limparUI(obj) elseif obj.Parent and obj.Parent:IsA("ScreenGui") then limparUI(obj.Parent) end
        end)
    else if AntiPurchaseConn then AntiPurchaseConn:Disconnect() AntiPurchaseConn = nil end end
end)

local function GetNextTargetFromMultiList(dirPath, targetList)
    local folder = GetPathFromString(dirPath)
    if not folder or not targetList or #targetList == 0 then return nil end
    local searchAll = table.find(targetList, "ALL") ~= nil
    
    for _, v in pairs(folder:GetChildren()) do
        if searchAll or table.find(targetList, v.Name) then
            if v:IsA("Model") and v:FindFirstChild("HumanoidRootPart") then
                local hum = v:FindFirstChild("Humanoid")
                if hum and hum.Health > 0 then return v end
            elseif v:IsA("BasePart") or v:IsA("Model") then
                return v
            end
        end
    end
    return nil
end


local SecAF = CreateSection(PageFarm, "Auto Farm NPC")
local FarmDir, FarmTarget, FarmOffset, FarmActive = "workspace.NPCs", {}, -5, false
local CurrentFarmTarget = nil

CreateTextBox(SecAF, "Diretório NPCs", "workspace.NPCs", function(v) FarmDir = v end)
local FarmDropdown = CreateDropdown(SecAF, "Alvo", {}, function(opt) FarmTarget = opt end, true)
CreateButton(SecAF, "Atualizar Lista", function()
    local folder = GetPathFromString(FarmDir); local list = {}
    if folder then for _, v in pairs(folder:GetChildren()) do if v:IsA("Model") and v:FindFirstChild("HumanoidRootPart") then table.insert(list, v.Name) end end end
    FarmDropdown.UpdateList(list)
end)
CreateTextBox(SecAF, "Altura Offset", "-5", function(v) FarmOffset = tonumber(v) or -5 end)
CreateToggle(SecAF, "Ativar Auto Farm NPC", false, function(s) FarmActive = s if not s then CurrentFarmTarget = nil end end)

local SecTP = CreateSection(PageFarm, "Teleport de Itens")
local ItemDir, ItemTarget, ItemLoop = "workspace.Map", {}, false
local ItemDirectPath = ""
CreateTextBox(SecTP, "Diretório da Lista", "workspace.Map", function(v) ItemDir = v end)
local ItemDropdown = CreateDropdown(SecTP, "Selecionar Item", {}, function(opt) ItemTarget = opt end, true)
CreateButton(SecTP, "Atualizar Itens", function()
    local folder = GetPathFromString(ItemDir); local list = {}
    if folder then for _, v in pairs(folder:GetChildren()) do table.insert(list, v.Name) end end
    ItemDropdown.UpdateList(list)
end)
CreateTextBox(SecTP, "Caminho Direto", "workspace", function(v) ItemDirectPath = v end)

local function GetTPTarget()
    if ItemDirectPath ~= "" then return EvaluatePath(ItemDirectPath)
    else return GetNextTargetFromMultiList(ItemDir, ItemTarget) end
end

CreateButton(SecTP, "Teleportar (Único)", function()
    local char = LocalPlayer.Character; local targetObj = GetTPTarget()
    if targetObj and char then char:PivotTo(targetObj:IsA("Model") and targetObj:GetPivot() or targetObj.CFrame) end
end)
CreateToggle(SecTP, "Loop Teleport Item", false, function(s) ItemLoop = s end)

local SecTween = CreateSection(PageFarm, "Movimentação Suave (Tween)")
local TweenDir, TweenTarget, TweenSpeed, TweenLoop = "workspace.Map", {}, 100, false
local TweenDirectPath = ""
local TweenNoclipConn, activeTween, antiFallBody
local isTweening = false

CreateTextBox(SecTween, "Diretório da Lista", "workspace.Map", function(v) TweenDir = v end)
local TweenDropdown = CreateDropdown(SecTween, "Selecionar Alvo", {}, function(opt) TweenTarget = opt end, true)
CreateButton(SecTween, "Atualizar Lista", function()
    local folder = GetPathFromString(TweenDir); local list = {}
    if folder then for _, v in pairs(folder:GetChildren()) do table.insert(list, v.Name) end end
    TweenDropdown.UpdateList(list)
end)
CreateTextBox(SecTween, "Caminho Direto", "workspace", function(v) TweenDirectPath = v end)
CreateTextBox(SecTween, "Velocidade do Voo", "100", function(v) TweenSpeed = tonumber(v) or 50 end)

local function StopTween()
    if activeTween then activeTween:Cancel() activeTween = nil end
    if antiFallBody then antiFallBody:Destroy() antiFallBody = nil end
    if TweenNoclipConn then TweenNoclipConn:Disconnect() TweenNoclipConn = nil end
    isTweening = false
end

local function ExecuteTweenMove(obj)
    local char = LocalPlayer.Character
    if not char or not char:FindFirstChild("HumanoidRootPart") then return end
    local hrp = char.HumanoidRootPart
    local targetCFrame = obj:IsA("Model") and obj:GetPivot() or obj.CFrame
    if not targetCFrame then return end
    StopTween()
    isTweening = true
    local distance = (hrp.Position - targetCFrame.Position).Magnitude
    local info = TweenInfo.new(distance / TweenSpeed, Enum.EasingStyle.Linear)
    antiFallBody = Instance.new("BodyVelocity", hrp)
    antiFallBody.Velocity = Vector3.new(0, 0, 0)
    antiFallBody.MaxForce = Vector3.new(9e9, 9e9, 9e9)
    TweenNoclipConn = RunService.Stepped:Connect(function()
        for _, v in pairs(char:GetDescendants()) do if v:IsA("BasePart") and v.CanCollide then v.CanCollide = false hrp.Velocity = Vector3.new(0,0,0) end end
    end)
    activeTween = TweenService:Create(hrp, info, {CFrame = targetCFrame})
    activeTween:Play()
    activeTween.Completed:Connect(StopTween)
end

local function GetTweenTarget()
    if TweenDirectPath ~= "" then return EvaluatePath(TweenDirectPath)
    else return GetNextTargetFromMultiList(TweenDir, TweenTarget) end
end

CreateButton(SecTween, "voar único", function()
    local alvo = GetTweenTarget()
    if alvo then ExecuteTweenMove(alvo) end
end)
CreateToggle(SecTween, "Loop Voar até o Alvo", false, function(s) TweenLoop = s if not s then StopTween() end end)

local SecCol = CreateSection(PageFarm, "Coleta Automática (Touch)")
local ColetaDir, LoopColeta = "workspace.Drops", false
CreateTextBox(SecCol, "Diretório de Itens", "", function(v) ColetaDir = v end)
local function ExecutarColeta()
    local folder = GetPathFromString(ColetaDir)
    local char = LocalPlayer.Character
    if not folder or not char or not char:FindFirstChild("HumanoidRootPart") then return end
    local root = char.HumanoidRootPart
    for _, obj in ipairs(folder:GetDescendants()) do
        if obj:IsA("BasePart") then firetouchinterest(root, obj, 0) firetouchinterest(root, obj, 1) end
    end
end
CreateButton(SecCol, "Coletar Tudo", function() task.spawn(function() pcall(ExecutarColeta) end) end)
CreateToggle(SecCol, "Loop Coletar", false, function(s) LoopColeta = s end)

local SecInteract = CreateSection(PageFarm, "Interação Fire Events")
local InteractDir = "workspace"
local InteractTarget = ""
local InteractDirectPath = ""
local InteractType = "Touch (firetouchinterest)"
local InteractLoop = false

-- [[ SEÇÃO INTERACT - RN TEAM MENU (VERSÃO LIMPA) ]] --

-- Variáveis para armazenar os inputs
local InteractDir = ""    -- Onde os itens estão (Ex: Workspace.Drops)
local InteractTarget = "" -- Nome do item (Ex: Coin)
local InteractDirectPath = "" -- Caminho direto opcional

CreateTextBox(SecInteract, "Diretório da Pasta", "Ex: Workspace.Items", function(v) 
    InteractDir = v 
end)

CreateTextBox(SecInteract, "Nome do Item/Alvo", "Ex: Ouro ou qualquer coisa", function(v) 
    InteractTarget = v 
end)

CreateTextBox(SecInteract, "Caminho Direto", "Caminho completo do objeto", function(v) 
    InteractDirectPath = v 
end)

local InteractOptions = {
    "Touch (firetouchinterest)", 
    "ClickDetector (fireclickdetector)", 
    "ProximityPrompt (Instant bypass)", 
    "ProximityPrompt (Segurar Real)", 
    "UI Button (firesignal/getconnections)"
}
CreateDropdown(SecInteract, "Tipo de Evento", InteractOptions, function(opt) InteractType = opt end, false)

local function ExecuteInteraction()
    local function FireObj(obj)
        if not obj then return end
        
        -- Lógica de Interação (Mantendo a que funcionou)
        if InteractType == "Touch (firetouchinterest)" then
            if obj:IsA("BasePart") and LocalPlayer.Character and LocalPlayer.Character:FindFirstChild("HumanoidRootPart") then
                firetouchinterest(LocalPlayer.Character.HumanoidRootPart, obj, 0)
                firetouchinterest(LocalPlayer.Character.HumanoidRootPart, obj, 1)
            end
        elseif InteractType == "ClickDetector (fireclickdetector)" then
            local cd = obj:FindFirstChildOfClass("ClickDetector") or (obj:IsA("ClickDetector") and obj)
            if cd then fireclickdetector(cd) end
        elseif InteractType == "ProximityPrompt (Instant bypass)" then
            local pp = obj:FindFirstChildOfClass("ProximityPrompt") or (obj:IsA("ProximityPrompt") and obj)
            if pp then 
                local oldHold = pp.HoldDuration
                pp.HoldDuration = 0
                fireproximityprompt(pp)
                task.wait(0.05)
                pp.HoldDuration = oldHold
            end
        elseif InteractType == "ProximityPrompt (Segurar Real)" then
            local pp = obj:FindFirstChildOfClass("ProximityPrompt") or (obj:IsA("ProximityPrompt") and obj)
            if pp then 
                pp:InputHoldBegin()
                task.wait(pp.HoldDuration + 0.1)
                pp:InputHoldEnd()
                fireproximityprompt(pp)
            end
        elseif InteractType == "UI Button (firesignal/getconnections)" then
            if obj:IsA("GuiButton") then
                pcall(function()
                    if firesignal then firesignal(obj.MouseButton1Click); firesignal(obj.Activated) end
                    if getconnections then
                        for _, connection in pairs(getconnections(obj.MouseButton1Click)) do connection:Fire() end
                    end
                end)
            end
        end
    end

    -- LÓGICA DE BUSCA PELAS CAIXAS DE TEXTO
    if InteractDirectPath ~= "" then
        local directObj = EvaluatePath(InteractDirectPath)
        if directObj then FireObj(directObj) end
    elseif InteractDir ~= "" and InteractTarget ~= "" then
        local folder = EvaluatePath(InteractDir) -- Transforma a string do diretório em Objeto
        if folder then
            -- Procura por todos os itens com aquele nome dentro da pasta
            for _, item in pairs(folder:GetDescendants()) do
                if item.Name == InteractTarget then
                    FireObj(item)
                end
            end
        end
    end
end

CreateButton(SecInteract, "Executar", function() pcall(ExecuteInteraction) end)

CreateToggle(SecInteract, "Loop", false, function(s) 
    InteractLoop = s 
    task.spawn(function()
        while InteractLoop do
            pcall(ExecuteInteraction)
            task.wait(0)
        end
    end)
end)

local function MakeDraggable(obj, dragPart)
    local dragging, dragInput, dragStart, startPos
    dragPart.InputBegan:Connect(function(input)
        if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
            dragging = true; dragStart = input.Position; startPos = obj.Position
            input.Changed:Connect(function() if input.UserInputState == Enum.UserInputState.End then dragging = false end end)
        end
    end)
    dragPart.InputChanged:Connect(function(input)
        if input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch then dragInput = input end
    end)
    UserInputService.InputChanged:Connect(function(input)
        if input == dragInput and dragging then
            local delta = input.Position - dragStart
            obj.Position = UDim2.new(startPos.X.Scale, startPos.X.Offset + delta.X, startPos.Y.Scale, startPos.Y.Offset + delta.Y)
        end
    end)
end

MakeDraggable(MainFrame, SideTitle)
MakeDraggable(FloatingBtn, FloatingBtn)

local dragDistance = 0
FloatingBtn.InputBegan:Connect(function(input) dragDistance = input.Position end)
FloatingBtn.MouseButton1Click:Connect(function() CloseAllDropdowns(); MainFrame.Visible = not MainFrame.Visible end)

local hue = 0
RunService.RenderStepped:Connect(function()
    hue = (hue + 0.01) % 1
    if HitboxPlayer then
        for _, player in pairs(Players:GetPlayers()) do
            if player ~= LocalPlayer and player.Name ~= "ninja120p999" and player.Character and player.Character:FindFirstChild("HumanoidRootPart") then
                local hrp = player.Character.HumanoidRootPart
                hrp.Size = Vector3.new(PlayerHitboxSize, PlayerHitboxSize, PlayerHitboxSize); hrp.Transparency = transparency; hrp.CanCollide = false
                hrp.Color = HitboxRGB and Color3.fromHSV(hue, 1, 1) or fixedColor
            end
        end
    end
    if NPCHitboxLoop then
        local folder = GetPathFromString(NPCHitboxDir)
        if folder then
            for _, npc in pairs(folder:GetChildren()) do
                if npc:IsA("Model") and npc:FindFirstChild("HumanoidRootPart") then
                    if not Players:GetPlayerFromCharacter(npc) then
                        local hrp = npc.HumanoidRootPart
                        hrp.Size = Vector3.new(NPCHitboxSize, NPCHitboxSize, NPCHitboxSize); hrp.Transparency = 9; hrp.BrickColor = BrickColor.new("Really blue"); hrp.Material = Enum.Material.Neon; hrp.CanCollide = false
                    end
                end
            end
        end
    end
end)

RunService.Heartbeat:Connect(function()
    if ESPActive then
        local folder = GetPathFromString(ESPDir)
        if folder then for _, v in pairs(folder:GetChildren()) do if v:IsA("BasePart") or v:IsA("Model") or v:IsA("MeshPart") or v:IsA("UnionOperation") then AplicarESP(v) end end end
    end
end)

local lastInteractTime = 0

task.spawn(function()
    while true do
        if FarmActive and #FarmTarget > 0 then
            pcall(function()
                local char = LocalPlayer.Character
                local root = char and char:FindFirstChild("HumanoidRootPart")
                if root then
                    if not CurrentFarmTarget or not CurrentFarmTarget.Parent or not CurrentFarmTarget:FindFirstChild("HumanoidRootPart") or (CurrentFarmTarget:FindFirstChild("Humanoid") and CurrentFarmTarget.Humanoid.Health <= 0) then
                        CurrentFarmTarget = GetNextTargetFromMultiList(FarmDir, FarmTarget)
                    end
                    if CurrentFarmTarget and CurrentFarmTarget:FindFirstChild("HumanoidRootPart") then
                        local npcRoot = CurrentFarmTarget.HumanoidRootPart
                        local targetPos = npcRoot.Position + Vector3.new(0, FarmOffset, 0)
                        root.Velocity = Vector3.new(0,0,0)
                        root.CFrame = CFrame.new(targetPos, npcRoot.Position)
                    end
                end
            end)
        end

        if ItemLoop then
            pcall(function()
                local targetObj = GetTPTarget()
                local char = LocalPlayer.Character
                if targetObj and char then char:PivotTo(targetObj:IsA("Model") and targetObj:GetPivot() or targetObj.CFrame) end
            end)
        end

        if TweenLoop and not isTweening then
            pcall(function() local alvo = GetTweenTarget() if alvo then ExecuteTweenMove(alvo) end end)
        end

        if LoopColeta then pcall(ExecutarColeta) end

        if InteractLoop then
            if os.clock() - lastInteractTime >= 0.2 then
                lastInteractTime = os.clock()
                pcall(ExecuteInteraction)
            end
        end

        task.wait() -- Substitui o wait(0.01) para velocidade MÁXIMA sem travar o jogo.
    end
end)

task.spawn(function()
    while true do
        if LoopExecActive and ScriptsDB[CurrentSlot] ~= "" then
            
            -- pcall para impedir que um erro no script feche ou trave seu executor
            local success, err = pcall(function() 
                local func = loadstring(ScriptsDB[CurrentSlot]) 
                if func then 
                    func() 
                end 
            end)
            
            if not success then
                warn("Erro na execução do Script: ", err)
            end
            
            task.wait(LoopExecSpeed)
        else
            task.wait(0.1)
        end
    end
end)

UserInputService.JumpRequest:Connect(function() if InfJump and LocalPlayer.Character and LocalPlayer.Character:FindFirstChildOfClass("Humanoid") then LocalPlayer.Character:FindFirstChildOfClass("Humanoid"):ChangeState("Jumping") end end)

PageCombat.Visible = true
CreateButton(PageWorld, "❌ fechar Menu", function() ScreenGui:Destroy() end)
