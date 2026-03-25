local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")
local RunService = game:GetService("RunService")
local HttpService = game:GetService("HttpService")
local Lighting = game:GetService("Lighting")
local LocalPlayer = Players.LocalPlayer
local Camera = workspace.CurrentCamera

local SaveFileName = "RN_TEAM_V4_SAVE.json"
local RN_Data = {
    ScriptsDB = {"", "", "", "", "", "", "", "", "", ""},
    Speed = 16,
    Jump = 50,
    AccentColor = {0, 180, 100}
}

local function SaveConfigs()
    pcall(function()
        writefile(SaveFileName, HttpService:JSONEncode(RN_Data))
    end)
end

local function LoadConfigs()
    pcall(function()
        if isfile and isfile(SaveFileName) then
            local data = HttpService:JSONDecode(readfile(SaveFileName))
            if data then
                if data.ScriptsDB then RN_Data.ScriptsDB = data.ScriptsDB end
                if data.Speed then RN_Data.Speed = data.Speed end
                if data.Jump then RN_Data.Jump = data.Jump end
                if data.AccentColor then RN_Data.AccentColor = data.AccentColor end
            end
        end
    end)
end
LoadConfigs()

local Theme = {
    Background = Color3.fromRGB(12, 12, 16),
    Panel = Color3.fromRGB(20, 20, 28),
    Outline = Color3.fromRGB(45, 45, 60),
    Accent = Color3.fromRGB(RN_Data.AccentColor[1], RN_Data.AccentColor[2], RN_Data.AccentColor[3]),
    Text = Color3.fromRGB(240, 240, 240),
    DarkText = Color3.fromRGB(140, 140, 150),
    Button = Color3.fromRGB(30, 30, 40)
}

local Config = {
    Box = false,
    Line = false,
    Health = false,
    Aimbot = false,
    FOVSize = 50,
    Smoothness = 0.80,
    TeamCheck = true,
    VisibleCheck = true
}
local Storage = {}

local function GetPathFromString(pathStr)
    local parts = string.split(pathStr, ".")
    local current = game
    for _, part in ipairs(parts) do
        if current:FindFirstChild(part) then
            current = current[part]
        elseif part == "workspace" or part == "Workspace" then
            current = workspace
        else
            return nil
        end
    end
    return current
end

local function GetNextTargetFromMultiList(dir, list)
    local folder = GetPathFromString(dir)
    if not folder then return nil end
    for _, obj in pairs(folder:GetChildren()) do
        if table.find(list, obj.Name) then return obj end
    end
    return nil
end

local noclipE = false
local antifall = false

local function noclip()
    if not LocalPlayer.Character then return end
    for i, v in pairs(LocalPlayer.Character:GetDescendants()) do
        if v:IsA("BasePart") and v.CanCollide == true then
            v.CanCollide = false
            if LocalPlayer.Character:FindFirstChild("HumanoidRootPart") then
                LocalPlayer.Character.HumanoidRootPart.Velocity = Vector3.new(0,0,0)
            end
        end
    end
end

local function moveto(targetCFrame, speed)
    local char = LocalPlayer.Character
    local root = char and char:FindFirstChild("HumanoidRootPart")
    if not root then return end
    
    local dist = (root.Position - targetCFrame.Position).Magnitude
    local info = TweenInfo.new(dist / speed, Enum.EasingStyle.Linear)
    local tween = TweenService:Create(root, info, {CFrame = targetCFrame})
 
    if not root:FindFirstChild("BodyVelocity") then
        antifall = Instance.new("BodyVelocity", root)
        antifall.Velocity = Vector3.new(0,0,0)
        noclipE = RunService.Stepped:Connect(noclip)
    end
    
    tween:Play()
 
    tween.Completed:Connect(function(playbackState)
        if playbackState == Enum.PlaybackState.Completed then
            if antifall then antifall:Destroy() antifall = false end
            if noclipE then noclipE:Disconnect() noclipE = false end
        end
    end)
end

local ScreenGui = Instance.new("ScreenGui", LocalPlayer:WaitForChild("PlayerGui"))
ScreenGui.Name = "RN_HACKER_V4"
ScreenGui.ResetOnSpawn = false
ScreenGui.DisplayOrder = 999999
ScreenGui.IgnoreGuiInset = true

local MainFrame = Instance.new("Frame", ScreenGui)
MainFrame.Size = UDim2.new(0, 680, 0, 450)
MainFrame.Position = UDim2.new(0.5, -340, 0.5, -225)
MainFrame.BackgroundColor3 = Theme.Background
MainFrame.Visible = false
MainFrame.BorderSizePixel = 0
Instance.new("UICorner", MainFrame).CornerRadius = UDim.new(0, 10)
local MainStroke = Instance.new("UIStroke", MainFrame); MainStroke.Color = Theme.Accent; MainStroke.Thickness = 1.2

local TopBar = Instance.new("Frame", MainFrame)
TopBar.Size = UDim2.new(1, 0, 0, 45); TopBar.BackgroundColor3 = Theme.Panel; TopBar.BorderSizePixel = 0
Instance.new("UICorner", TopBar).CornerRadius = UDim.new(0, 10)

local CloseBtn = Instance.new("TextButton", TopBar)
CloseBtn.Size = UDim2.new(0, 40, 0, 40); CloseBtn.Position = UDim2.new(1, -45, 0, 2)
CloseBtn.BackgroundTransparency = 1; CloseBtn.Text = "X"; CloseBtn.TextColor3 = Color3.fromRGB(255, 80, 80)
CloseBtn.Font = Enum.Font.GothamBold; CloseBtn.TextSize = 20
CloseBtn.MouseButton1Click:Connect(function() ScreenGui:Destroy() end)

local Title = Instance.new("TextLabel", TopBar)
Title.Size = UDim2.new(0, 200, 1, 0); Title.Position = UDim2.new(0, 15, 0, 0)
Title.BackgroundTransparency = 1; Title.Text = "RN TEAM"; Title.Font = Enum.Font.Code
Title.TextColor3 = Theme.Accent; Title.TextSize = 18; Title.TextXAlignment = Enum.TextXAlignment.Left

local TabContainer = Instance.new("Frame", MainFrame)
TabContainer.Size = UDim2.new(0, 150, 1, -55); TabContainer.Position = UDim2.new(0, 10, 0, 50)
TabContainer.BackgroundTransparency = 1
local TabList = Instance.new("UIListLayout", TabContainer); TabList.Padding = UDim.new(0, 6)

local PagesFolder = Instance.new("Frame", MainFrame)
PagesFolder.Size = UDim2.new(1, -180, 1, -60); PagesFolder.Position = UDim2.new(0, 170, 0, 55)
PagesFolder.BackgroundTransparency = 1

local FloatingBtn = Instance.new("Frame", ScreenGui)
FloatingBtn.Size = UDim2.new(0, 60, 0, 60); FloatingBtn.Position = UDim2.new(0.05, 0, 0.1, 0)
FloatingBtn.BackgroundColor3 = Theme.Background; FloatingBtn.Active = true
Instance.new("UICorner", FloatingBtn).CornerRadius = UDim.new(1, 0)
local FloatStroke = Instance.new("UIStroke", FloatingBtn); FloatStroke.Color = Theme.Accent; FloatStroke.Thickness = 2

local FloatClick = Instance.new("TextButton", FloatingBtn)
FloatClick.Size = UDim2.new(1, 0, 1, 0); FloatClick.BackgroundTransparency = 1
FloatClick.Text = "RN"; FloatClick.TextColor3 = Theme.Accent; FloatClick.Font = Enum.Font.GothamBold; FloatClick.TextSize = 20
FloatClick.MouseButton1Click:Connect(function() MainFrame.Visible = not MainFrame.Visible end)

local function MakeDraggable(obj, dragPart)
    local dragging, dragInput, dragStart, startPos
    dragPart.InputBegan:Connect(function(input)
        if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
            dragging = true; dragStart = input.Position; startPos = obj.Position
            input.Changed:Connect(function() if input.UserInputState == Enum.UserInputState.End then dragging = false end end)
        end
    end)
    UserInputService.InputChanged:Connect(function(input)
        if dragging and (input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch) then
            local delta = input.Position - dragStart
            obj.Position = UDim2.new(startPos.X.Scale, startPos.X.Offset + delta.X, startPos.Y.Scale, startPos.Y.Offset + delta.Y)
        end
    end)
end
MakeDraggable(MainFrame, TopBar); 
MakeDraggable(FloatingBtn, FloatClick)

function CreatePage()
    local page = Instance.new("Frame", PagesFolder)
    page.Size = UDim2.new(1, 0, 1, 0); page.BackgroundTransparency = 1; page.Visible = false
    local Left = Instance.new("ScrollingFrame", page); Left.Size = UDim2.new(0.48, 0, 1, 0); Left.BackgroundTransparency = 1; Left.ScrollBarThickness = 0
    local Right = Instance.new("ScrollingFrame", page); Right.Size = UDim2.new(0.48, 0, 1, 0); Right.Position = UDim2.new(0.52, 0, 0, 0); Right.BackgroundTransparency = 1; Right.ScrollBarThickness = 0
    Instance.new("UIListLayout", Left).Padding = UDim.new(0, 8); Instance.new("UIListLayout", Right).Padding = UDim.new(0, 8)
    return page, Left, Right
end

function AddTab(name, pageObj)
    local btn = Instance.new("TextButton", TabContainer)
    btn.Size = UDim2.new(1, 0, 0, 38); btn.BackgroundColor3 = Theme.Panel; btn.Text = name; btn.TextColor3 = Theme.DarkText
    btn.Font = Enum.Font.Code; btn.TextSize = 13; Instance.new("UICorner", btn).CornerRadius = UDim.new(0, 6)
    local btnStroke = Instance.new("UIStroke", btn); btnStroke.Color = Theme.Outline
    btn.MouseButton1Click:Connect(function()
        for _, p in pairs(PagesFolder:GetChildren()) do p.Visible = false end
        for _, b in pairs(TabContainer:GetChildren()) do 
            if b:IsA("TextButton") then 
                b.TextColor3 = Theme.DarkText
            end 
        end
        pageObj.Visible = true; btn.TextColor3 = Theme.Accent
    end)
end

function CreateButton(parent, text, callback)
    local btn = Instance.new("TextButton", parent)
    btn.Size = UDim2.new(1, 0, 0, 35); btn.BackgroundColor3 = Theme.Panel; btn.Text = text
    btn.TextColor3 = Theme.Text; btn.Font = Enum.Font.Code; btn.TextSize = 12
    Instance.new("UICorner", btn).CornerRadius = UDim.new(0, 6)
    Instance.new("UIStroke", btn).Color = Theme.Outline
    btn.MouseButton1Click:Connect(callback)
    return btn
end

local ToggleElements = {}
function CreateToggle(parent, text, callback)
    local btn = Instance.new("TextButton", parent)
    btn.Size = UDim2.new(1, 0, 0, 38); btn.BackgroundColor3 = Theme.Panel; btn.Text = "  " .. text
    btn.TextColor3 = Theme.Text; btn.TextXAlignment = Enum.TextXAlignment.Left; btn.Font = Enum.Font.Code; btn.TextSize = 12
    Instance.new("UICorner", btn).CornerRadius = UDim.new(0, 6)
    
    local toggleBg = Instance.new("Frame", btn)
    toggleBg.Size = UDim2.new(0, 34, 0, 18); toggleBg.Position = UDim2.new(1, -40, 0.5, -9)
    toggleBg.BackgroundColor3 = Color3.fromRGB(40, 40, 50); Instance.new("UICorner", toggleBg).CornerRadius = UDim.new(1, 0)
    
    local ball = Instance.new("Frame", toggleBg)
    ball.Size = UDim2.new(0, 14, 0, 14); ball.Position = UDim2.new(0, 2, 0.5, -7)
    ball.BackgroundColor3 = Color3.fromRGB(200, 200, 200); Instance.new("UICorner", ball).CornerRadius = UDim.new(1, 0)
    
    local state = false
    table.insert(ToggleElements, {bg = toggleBg, getState = function() return state end})

    btn.MouseButton1Click:Connect(function()
        state = not state
        local targetPos = state and UDim2.new(1, -16, 0.5, -7) or UDim2.new(0, 2, 0.5, -7)
        local targetColor = state and Theme.Accent or Color3.fromRGB(40, 40, 50)
        TweenService:Create(ball, TweenInfo.new(0.2), {Position = targetPos}):Play()
        TweenService:Create(toggleBg, TweenInfo.new(0.2), {BackgroundColor3 = targetColor}):Play()
        callback(state)
    end)
end

function CreateDropdown(parent, text, list, callback)
    local dropFrame = Instance.new("Frame", parent)
    dropFrame.Size = UDim2.new(1, 0, 0, 38); dropFrame.BackgroundColor3 = Theme.Panel; dropFrame.ClipsDescendants = true
    Instance.new("UICorner", dropFrame).CornerRadius = UDim.new(0, 6)
    local btn = Instance.new("TextButton", dropFrame)
    btn.Size = UDim2.new(1, 0, 0, 38); btn.BackgroundTransparency = 1; btn.Text = "  v " .. text; btn.TextColor3 = Theme.Text
    btn.TextXAlignment = Enum.TextXAlignment.Left; btn.Font = Enum.Font.Code; btn.TextSize = 12
    
    local container = Instance.new("Frame", dropFrame)
    container.Position = UDim2.new(0, 0, 0, 38); container.Size = UDim2.new(1, 0, 0, #list * 30)
    container.BackgroundTransparency = 1; local layout = Instance.new("UIListLayout", container)
    
    local open = false
    btn.MouseButton1Click:Connect(function()
        open = not open
        TweenService:Create(dropFrame, TweenInfo.new(0.3), {Size = open and UDim2.new(1, 0, 0, 38 + container.Size.Y.Offset) or UDim2.new(1, 0, 0, 38)}):Play()
    end)
    
    local function UpdateList(newList)
        for _, child in pairs(container:GetChildren()) do if child:IsA("TextButton") then child:Destroy() end end
        container.Size = UDim2.new(1, 0, 0, #newList * 30)
        for _, item in pairs(newList) do
            local itm = Instance.new("TextButton", container)
            itm.Size = UDim2.new(1, 0, 0, 30); itm.BackgroundTransparency = 1; itm.Text = item; itm.TextColor3 = Theme.DarkText
            itm.Font = Enum.Font.Code; itm.TextSize = 11
            itm.MouseButton1Click:Connect(function() 
                btn.Text = "  v " .. text .. ": " .. item; callback(item)
                open = false; TweenService:Create(dropFrame, TweenInfo.new(0.3), {Size = UDim2.new(1, 0, 0, 38)}):Play()
            end)
        end
        if open then TweenService:Create(dropFrame, TweenInfo.new(0.3), {Size = UDim2.new(1, 0, 0, 38 + container.Size.Y.Offset)}):Play() end
    end
    UpdateList(list)
    return {UpdateList = UpdateList}
end

function CreateTextBox(parent, text, placeholder, callback)
    local frame = Instance.new("Frame", parent)
    frame.Size = UDim2.new(1, 0, 0, 38); frame.BackgroundColor3 = Theme.Panel
    Instance.new("UICorner", frame).CornerRadius = UDim.new(0, 6)
    
    local lbl = Instance.new("TextLabel", frame)
    lbl.Size = UDim2.new(0.5, -5, 1, 0); lbl.Position = UDim2.new(0, 10, 0, 0)
    lbl.BackgroundTransparency = 1; lbl.Text = text; lbl.TextColor3 = Theme.Text
    lbl.Font = Enum.Font.Code; lbl.TextSize = 12; lbl.TextXAlignment = Enum.TextXAlignment.Left
    
    local box = Instance.new("TextBox", frame)
    box.Size = UDim2.new(0.5, -15, 0, 28); box.Position = UDim2.new(0.5, 5, 0.5, -14)
    box.BackgroundColor3 = Theme.Background; box.TextColor3 = Theme.Text; box.PlaceholderText = placeholder
    box.Font = Enum.Font.Code; box.TextSize = 12
    Instance.new("UICorner", box).CornerRadius = UDim.new(0, 4); Instance.new("UIStroke", box).Color = Theme.Outline
    
    box.FocusLost:Connect(function() callback(box.Text) end)
end

function CreateSection(parent, title)
    local sectionFrame = Instance.new("Frame", parent)
    sectionFrame.Size = UDim2.new(1, 0, 0, 35)
    sectionFrame.BackgroundColor3 = Theme.Background
    sectionFrame.ClipsDescendants = true
    Instance.new("UICorner", sectionFrame).CornerRadius = UDim.new(0, 6)
    Instance.new("UIStroke", sectionFrame).Color = Theme.Outline

    local btn = Instance.new("TextButton", sectionFrame)
    btn.Size = UDim2.new(1, 0, 0, 35)
    btn.BackgroundColor3 = Theme.Panel
    btn.Text = "  ▶ " .. title
    btn.TextColor3 = Theme.Text
    btn.Font = Enum.Font.GothamBold
    btn.TextSize = 12
    btn.TextXAlignment = Enum.TextXAlignment.Left
    Instance.new("UICorner", btn).CornerRadius = UDim.new(0, 6)

    local container = Instance.new("Frame", sectionFrame)
    container.Position = UDim2.new(0, 0, 0, 40)
    container.Size = UDim2.new(1, 0, 1, -40)
    container.BackgroundTransparency = 1
    
    local layout = Instance.new("UIListLayout", container)
    layout.Padding = UDim.new(0, 6)

    local open = false
    
    local function UpdateSize()
        local totalHeight = 40
        for _, child in pairs(container:GetChildren()) do
            if child:IsA("GuiObject") then
                totalHeight = totalHeight + child.Size.Y.Offset + layout.Padding.Offset
            end
        end
        if open then
            TweenService:Create(sectionFrame, TweenInfo.new(0.3), {Size = UDim2.new(1, 0, 0, totalHeight)}):Play()
        end
        return totalHeight
    end

    btn.MouseButton1Click:Connect(function()
        open = not open
        btn.Text = (open and "  ▼ " .. title or "  ▶ " .. title)
        if open then
            UpdateSize()
        else
            TweenService:Create(sectionFrame, TweenInfo.new(0.3), {Size = UDim2.new(1, 0, 0, 35)}):Play()
        end
    end)

    return container 
end

local PageCombat, C_L, C_R = CreatePage()
local PageFarm, F_L, F_R = CreatePage()
local PageWorld, W_L, W_R = CreatePage()
local PageMove, M_L, M_R = CreatePage()
local PageExecutor = Instance.new("Frame", PagesFolder)
local PageConfig, Cfg_L, Cfg_R = CreatePage()

PageExecutor.Size = UDim2.new(1, 0, 1, 0); PageExecutor.BackgroundTransparency = 1; PageExecutor.Visible = false

AddTab("⚔️ Combate", PageCombat)
AddTab("😏 Farm", PageFarm)
AddTab("🔍 Visual", PageWorld)
AddTab("🏃 Movimento", PageMove)
AddTab("💻 Executor", PageExecutor)
AddTab("⚙️ Config", PageConfig)

local SecTheme = CreateSection(Cfg_L, "Tema Customizado")
CreateTextBox(SecTheme, "Cor RGB", RN_Data.AccentColor[1].." "..RN_Data.AccentColor[2].." "..RN_Data.AccentColor[3], function(val)
    local r, g, b = val:match("(%d+)%D+(%d+)%D+(%d+)")
    if r and g and b then
        Theme.Accent = Color3.fromRGB(tonumber(r), tonumber(g), tonumber(b))
        RN_Data.AccentColor = {tonumber(r), tonumber(g), tonumber(b)}
        SaveConfigs()
        
        Title.TextColor3 = Theme.Accent
        MainStroke.Color = Theme.Accent
        FloatStroke.Color = Theme.Accent
        FloatClick.TextColor3 = Theme.Accent
        
        for _, btn in pairs(TabContainer:GetChildren()) do
            if btn:IsA("TextButton") and btn.TextColor3 ~= Theme.DarkText then
                btn.TextColor3 = Theme.Accent
            end
        end
        
        for _, tData in pairs(ToggleElements) do
            if tData.getState() then
                tData.bg.BackgroundColor3 = Theme.Accent
            end
        end
    end
end)

local SecSys = CreateSection(Cfg_R, "Sistema")
CreateButton(SecSys, "🔄 Reentrar no Servidor", function()
    game:GetService("TeleportService"):TeleportToPlaceInstance(game.PlaceId, game.JobId, LocalPlayer)
end)
CreateButton(SecSys, "🗑️ Destruir Menu (Panic)", function()
    ScreenGui:Destroy()
end)

local SecHitP = CreateSection(C_L, "Hitbox Jogadores")
local HitboxPlayer, PlayerHitboxSize, transparency, playerFixedColor = false, 10, 0.5, Color3.new(0, 1, 0)
CreateTextBox(SecHitP, "Tamanho", "10", function(v) PlayerHitboxSize = tonumber(v) or 10 end)
CreateToggle(SecHitP, "Ativar Hitbox", function(s) HitboxPlayer = s 
    if not s then for _, p in pairs(Players:GetPlayers()) do if p ~= LocalPlayer and p.Character and p.Character:FindFirstChild("HumanoidRootPart") then local hrp = p.Character.HumanoidRootPart hrp.Size = Vector3.new(2, 2, 1) hrp.Transparency = 1 hrp.CanCollide = true end end end
end)

local SecNovoAim = CreateSection(C_L, "Aimbot & ESP (Novo)")
CreateToggle(SecNovoAim, "Ativar Aimbot", function(s) Config.Aimbot = s end)
CreateTextBox(SecNovoAim, "Tamanho FOV", "50", function(v) Config.FOVSize = tonumber(v) or 50 end)
CreateToggle(SecNovoAim, "Team Check", function(s) Config.TeamCheck = s end)
CreateToggle(SecNovoAim, "Visible Check", function(s) Config.VisibleCheck = s end)

local SecNovoEsp = CreateSection(C_R, "Drawings ESP (Novo)")
CreateToggle(SecNovoEsp, "ESP Box", function(s) Config.Box = s end)
CreateToggle(SecNovoEsp, "ESP Linha", function(s) Config.Line = s end)
CreateToggle(SecNovoEsp, "ESP Vida", function(s) Config.Health = s end)

local SecHitN = CreateSection(C_R, "Hitbox NPCs")
local NPCHitboxDir, NPCHitboxSize, NPCHitboxLoop, npcFixedColor = "workspace.NPCs", 20, false, Color3.new(0, 0, 1)
CreateTextBox(SecHitN, "Diretório NPCs", "workspace.NPCs", function(v) NPCHitboxDir = v end)
CreateTextBox(SecHitN, "Tamanho NPC", "20", function(v) NPCHitboxSize = tonumber(v) or 20 end)
CreateToggle(SecHitN, "Ativar Hitbox NPC", function(s) NPCHitboxLoop = s end)

local SecFarmP = CreateSection(F_L, "Auto Farm Jogadores")
local FarmPlayerActive, FarmPlayerTeamCheck, FarmPlayerOffset = false, true, -5
CreateTextBox(SecFarmP, "Altura Offset", "-5", function(v) FarmPlayerOffset = tonumber(v) or -5 end)
CreateToggle(SecFarmP, "Ignorar Aliados", function(s) FarmPlayerTeamCheck = s end)
CreateToggle(SecFarmP, "Ativar Farm Jogadores", function(s) FarmPlayerActive = s end)

local SecFarmN = CreateSection(F_L, "Auto Farm NPCs")
local FarmDir, FarmTarget, FarmOffset, FarmActive, CurrentFarmTarget = "workspace.NPCs", {}, -5, false, nil
CreateTextBox(SecFarmN, "Diretório NPCs", "workspace.NPCs", function(v) FarmDir = v end)
local FarmDropdown = CreateDropdown(SecFarmN, "Alvo", {}, function(opt) FarmTarget = {opt} end)
CreateButton(SecFarmN, "Atualizar Lista", function()
    local folder = GetPathFromString(FarmDir); local list = {}
    if folder then for _, v in pairs(folder:GetChildren()) do if v:IsA("Model") and v:FindFirstChild("HumanoidRootPart") then table.insert(list, v.Name) end end end
    FarmDropdown.UpdateList(list)
end)
CreateTextBox(SecFarmN, "Altura Offset", "-5", function(v) FarmOffset = tonumber(v) or -5 end)
CreateToggle(SecFarmN, "Ativar Auto Farm NPC", function(s) FarmActive = s if not s then CurrentFarmTarget = nil end end)

local SecFarmI = CreateSection(F_R, "Auto Farm Itens")
local FarmAllDir, FarmAllActive, FarmAllSpeed, CurrentItemTarget = "workspace.Drops", false, 100, nil
CreateTextBox(SecFarmI, "Diretório", "workspace.Drops", function(v) FarmAllDir = v end)
CreateTextBox(SecFarmI, "Velocidade", "100", function(v) FarmAllSpeed = tonumber(v) or 100 end)
CreateToggle(SecFarmI, "Ativar Farm", function(s) FarmAllActive = s if not s then CurrentItemTarget = nil end end)

local SecTeleport = CreateSection(F_R, "Teleport e Coleta")
local ItemDir, ItemTarget, ItemLoop, ItemDirectPath = "workspace.Map", {}, false, ""
CreateTextBox(SecTeleport, "Diretório (TP)", "workspace.Map", function(v) ItemDir = v end)
local ItemDropdown = CreateDropdown(SecTeleport, "Selecionar Item", {}, function(opt) ItemTarget = {opt} end)
CreateButton(SecTeleport, "Atualizar Itens", function()
    local folder = GetPathFromString(ItemDir); local list = {}
    if folder then for _, v in pairs(folder:GetChildren()) do table.insert(list, v.Name) end end
    ItemDropdown.UpdateList(list)
end)
CreateToggle(SecTeleport, "Loop Teleport", function(s) ItemLoop = s end)

local ColetaDir, LoopColeta = "workspace.Drops", false
CreateTextBox(SecTeleport, "Diretório Coleta", "workspace.Drops", function(v) ColetaDir = v end)
local function ExecutarColeta()
    local folder = GetPathFromString(ColetaDir)
    local char = LocalPlayer.Character
    if not folder or not char or not char:FindFirstChild("HumanoidRootPart") then return end
    local root = char.HumanoidRootPart
    for _, obj in ipairs(folder:GetDescendants()) do if obj:IsA("BasePart") then firetouchinterest(root, obj, 0) firetouchinterest(root, obj, 1) end end
end
CreateToggle(SecTeleport, "Loop Coletar Area", function(s) LoopColeta = s end)

local SecVis = CreateSection(W_L, "Visual & Ambiente")
local OriginalLighting = {Ambient = Lighting.Ambient, Brightness = Lighting.Brightness, OutdoorAmbient = Lighting.OutdoorAmbient}
CreateToggle(SecVis, "Fullbright", function(state)
    if state then Lighting.Ambient = Color3.new(1, 1, 1) Lighting.OutdoorAmbient = Color3.new(1, 1, 1) Lighting.Brightness = 2
    else Lighting.Ambient = OriginalLighting.Ambient Lighting.OutdoorAmbient = OriginalLighting.OutdoorAmbient Lighting.Brightness = OriginalLighting.Brightness end
end)

local AntiPurchaseConn = nil
CreateToggle(SecVis, "Fechar Tela Compras", function(state)
    local pGui = LocalPlayer:WaitForChild("PlayerGui")
    local function limparUI(gui)
        if not state or gui.Name == "RN_HACKER_V4" then return end
        pcall(function()
            if gui:IsA("ScreenGui") then
                for _, v in pairs(gui:GetDescendants()) do
                    if (v:IsA("Frame") or v:IsA("ImageLabel")) and v.Visible then
                        local size, screen = v.AbsoluteSize, workspace.CurrentCamera.ViewportSize
                        if size.X > (screen.X * 0.7) and size.Y > (screen.Y * 0.7) then v.Visible = false end
                    end
                end
            end
        end)
    end
    if state then
        for _, gui in pairs(pGui:GetChildren()) do limparUI(gui) end
        AntiPurchaseConn = pGui.DescendantAdded:Connect(function(obj) task.wait(0.5) if obj:IsA("ScreenGui") then limparUI(obj) elseif obj.Parent and obj.Parent:IsA("ScreenGui") then limparUI(obj.Parent) end end)
    else if AntiPurchaseConn then AntiPurchaseConn:Disconnect() AntiPurchaseConn = nil end end
end)

local SecESP = CreateSection(W_R, "ESP System")
local ESPDir, ESPActive, ESPTags = "workspace.Itens", false, {}
local function AplicarESP(obj)
    if not obj:FindFirstChild("RN_ESP_Tag") then
        local bgui = Instance.new("BillboardGui", obj); bgui.Name = "RN_ESP_Tag"; bgui.AlwaysOnTop = true; bgui.Size = UDim2.new(0, 100, 0, 30); bgui.StudsOffset = Vector3.new(0, 2, 0)
        local text = Instance.new("TextLabel", bgui); text.BackgroundTransparency = 1; text.Size = UDim2.new(1, 0, 1, 0); text.Text = obj.Name; text.TextColor3 = Color3.new(1, 1, 1); text.Font = Enum.Font.SourceSansBold; text.TextSize = 10
        local hl = Instance.new("Highlight", obj); hl.Name = "RN_ESP_HL"; hl.FillColor = Color3.new(1, 1, 1); hl.FillTransparency = 0.5
        table.insert(ESPTags, {obj, bgui, hl})
    end
end
CreateTextBox(SecESP, "Diretório ESP", "workspace.Itens", function(v) ESPDir = v end)
CreateToggle(SecESP, "ESP Objetos", function(s) ESPActive = s; if not s then for _, data in pairs(ESPTags) do if data[2] then data[2]:Destroy() end if data[3] then data[3]:Destroy() end end ESPTags = {} end end)

local TracersActive, ChamsActive, Tracers, CustomESPColor = false, false, {}, Color3.new(1, 1, 1)
local function CreateTracer(player)
    if Tracers[player] then return end
    local Tracer = Drawing.new("Line"); Tracer.Visible = false; Tracer.Color = CustomESPColor; Tracer.Thickness = 1; Tracer.Transparency = 1
    Tracers[player] = Tracer
end
CreateToggle(SecESP, "Esp Linha (Tracers)", function(state) TracersActive = state if not state then for _, t in pairs(Tracers) do t.Visible = false end end end)
CreateToggle(SecESP, "Esp Parede (Chams)", function(state) ChamsActive = state if not state then for _, player in pairs(Players:GetPlayers()) do if player.Character and player.Character:FindFirstChild("RN_Chams") then player.Character.RN_Chams.Enabled = false end end end end)

local SecMoveB = CreateSection(M_L, "Atributos do Player")
local DesiredSpeed, DesiredJump = RN_Data.Speed, RN_Data.Jump
local SpeedAtivo, JumpAtivo = false, false

local function ApplyStats(character) 
    local humanoid = character:WaitForChild("Humanoid") 
    humanoid.WalkSpeed = DesiredSpeed 
    humanoid.JumpHeight = DesiredJump 
end
LocalPlayer.CharacterAdded:Connect(ApplyStats)

CreateTextBox(SecMoveB, "Velocidade", tostring(DesiredSpeed), function(val) 
    DesiredSpeed = tonumber(val) or 16 
    RN_Data.Speed = DesiredSpeed
    SaveConfigs()
    if LocalPlayer.Character then ApplyStats(LocalPlayer.Character) end 
end)

CreateToggle(SecMoveB, "Ativar Speed", function(state)
    SpeedAtivo = state
    if not state and LocalPlayer.Character and LocalPlayer.Character:FindFirstChild("Humanoid") then
        LocalPlayer.Character.Humanoid.WalkSpeed = 16
    end
end)

CreateTextBox(SecMoveB, "Pulo", tostring(DesiredJump), function(val) 
    DesiredJump = tonumber(val) or 50 
    RN_Data.Jump = DesiredJump
    SaveConfigs()
    if LocalPlayer.Character then ApplyStats(LocalPlayer.Character) end 
end)

CreateToggle(SecMoveB, "Ativar Super Pulo", function(state)
    JumpAtivo = state
    if not state and LocalPlayer.Character and LocalPlayer.Character:FindFirstChild("Humanoid") then
        LocalPlayer.Character.Humanoid.UseJumpPower = true
        LocalPlayer.Character.Humanoid.JumpPower = 50
    end
end)

RunService.Heartbeat:Connect(function()
    local char = LocalPlayer.Character
    if char then
        local hum = char:FindFirstChild("Humanoid")
        if hum then
            if SpeedAtivo then
                hum.WalkSpeed = DesiredSpeed
            end
            if JumpAtivo then
                hum.UseJumpPower = true
                hum.JumpPower = DesiredJump
            end
        end
    end
end)

local SecMoveE = CreateSection(M_L, "Poderes de Movimento")
local InfJump, NoclipConn = false, nil
CreateToggle(SecMoveE, "Pulo Infinito", function(s) InfJump = s end)
CreateToggle(SecMoveE, "Noclip", function(state)
    if state then NoclipConn = RunService.Stepped:Connect(function() if LocalPlayer.Character then for _, v in pairs(LocalPlayer.Character:GetDescendants()) do if v:IsA("BasePart") and v.CanCollide then v.CanCollide = false end end end end)
    else if NoclipConn then NoclipConn:Disconnect() end end
end)
UserInputService.JumpRequest:Connect(function() if InfJump and LocalPlayer.Character and LocalPlayer.Character:FindFirstChildOfClass("Humanoid") then LocalPlayer.Character:FindFirstChildOfClass("Humanoid"):ChangeState("Jumping") end end)

local SecMoveT = CreateSection(M_R, "Mover até Jogador")
local IrJogadorAtivo, IrJogadorTeamCheck, TweenSpeed = false, true, 100
CreateTextBox(SecMoveT, "Velocidade Tween", "100", function(v) TweenSpeed = tonumber(v) or 100 end)
CreateToggle(SecMoveT, "Ignorar Aliados", function(s) IrJogadorTeamCheck = s end)
CreateToggle(SecMoveT, "Ativar Perseguição", function(s) IrJogadorAtivo = s end)


local CurrentSlot = 1

local ExecNav = Instance.new("Frame", PageExecutor)
ExecNav.Size = UDim2.new(1, 0, 0, 35)
ExecNav.BackgroundTransparency = 1

local BtnPrev = Instance.new("TextButton", ExecNav)
BtnPrev.Size = UDim2.new(0.2, 0, 1, 0)
BtnPrev.BackgroundColor3 = Theme.Button
BtnPrev.Text = "◀️"
BtnPrev.TextColor3 = Theme.Text
BtnPrev.TextSize = 10
Instance.new("UICorner", BtnPrev).CornerRadius = UDim.new(0, 6)

local LblSlot = Instance.new("TextLabel", ExecNav)
LblSlot.Size = UDim2.new(0.5, 0, 1, 0)
LblSlot.Position = UDim2.new(0.25, 0, 0, 0)
LblSlot.BackgroundTransparency = 1
LblSlot.Text = "Script Slot 1"
LblSlot.TextColor3 = Theme.Text
LblSlot.Font = Enum.Font.GothamBold
LblSlot.TextSize = 10

local BtnNext = Instance.new("TextButton", ExecNav)
BtnNext.Size = UDim2.new(0.2, 0, 1, 0)
BtnNext.Position = UDim2.new(0.8, 0, 0, 0)
BtnNext.BackgroundColor3 = Theme.Button
BtnNext.Text = "▶️"
BtnNext.TextColor3 = Theme.Text
BtnNext.TextSize = 10
Instance.new("UICorner", BtnNext).CornerRadius = UDim.new(0, 6)

local scriptBoxBase = Instance.new("Frame", PageExecutor)
scriptBoxBase.Size = UDim2.new(1, -10, 1, -95)
scriptBoxBase.Position = UDim2.new(0, 5, 0, 45)
scriptBoxBase.BackgroundTransparency = 1

local scrollEditor = Instance.new("ScrollingFrame", scriptBoxBase)
scrollEditor.Size = UDim2.new(1, 0, 1, 0)
scrollEditor.BackgroundTransparency = 1
scrollEditor.CanvasSize = UDim2.new(0, 0, 0, 0)
scrollEditor.AutomaticCanvasSize = Enum.AutomaticSize.Y
scrollEditor.ScrollBarThickness = 4
scrollEditor.ScrollBarImageColor3 = Theme.Outline

local scriptBox = Instance.new("TextBox", scrollEditor)
scriptBox.Size = UDim2.new(1, -5, 1, 0)
scriptBox.BackgroundColor3 = Theme.Panel
scriptBox.Text = RN_Data.ScriptsDB[CurrentSlot]
scriptBox.PlaceholderText = "-- Cole seu script aqui..."
scriptBox.TextColor3 = Theme.Text
scriptBox.Font = Enum.Font.Code
scriptBox.TextSize = 10
scriptBox.TextXAlignment = Enum.TextXAlignment.Left
scriptBox.TextYAlignment = Enum.TextYAlignment.Top
scriptBox.ClearTextOnFocus = false
scriptBox.MultiLine = true
scriptBox.ClipsDescendants = true
Instance.new("UICorner", scriptBox).CornerRadius = UDim.new(0, 6)
Instance.new("UIStroke", scriptBox).Color = Theme.Outline

local BtnClear = Instance.new("TextButton", PageExecutor)
BtnClear.Size = UDim2.new(0.48, 0, 0, 38)
BtnClear.Position = UDim2.new(0, 5, 1, -45)
BtnClear.BackgroundColor3 = Theme.Panel
BtnClear.Text = "🗑️ Limpar Caixa"
BtnClear.TextColor3 = Theme.Text
BtnClear.Font = Enum.Font.GothamBold
BtnClear.TextSize = 12
Instance.new("UICorner", BtnClear).CornerRadius = UDim.new(0, 6)
Instance.new("UIStroke", BtnClear).Color = Theme.Outline

local BtnExec = Instance.new("TextButton", PageExecutor)
BtnExec.Size = UDim2.new(0.48, 0, 0, 38)
BtnExec.Position = UDim2.new(0.52, -5, 1, -45)
BtnExec.BackgroundColor3 = Theme.Panel
BtnExec.Text = "Executar"
BtnExec.TextColor3 = Theme.Text
BtnExec.Font = Enum.Font.GothamBold
BtnExec.TextSize = 12
Instance.new("UICorner", BtnExec).CornerRadius = UDim.new(0, 6)
Instance.new("UIStroke", BtnExec).Color = Theme.Outline

local function UpdateExecutorUI() 
    LblSlot.Text = "Script Slot " .. CurrentSlot
    scriptBox.Text = RN_Data.ScriptsDB[CurrentSlot] 
end

BtnPrev.MouseButton1Click:Connect(function() 
    if CurrentSlot > 1 then CurrentSlot = CurrentSlot - 1 else CurrentSlot = 10 end
    UpdateExecutorUI() 
end)

BtnNext.MouseButton1Click:Connect(function() 
    if CurrentSlot < 10 then CurrentSlot = CurrentSlot + 1 else CurrentSlot = 1 end
    UpdateExecutorUI() 
end)

BtnClear.MouseButton1Click:Connect(function() 
    RN_Data.ScriptsDB[CurrentSlot] = "" 
    scriptBox.Text = "" 
    SaveConfigs()
end)

BtnExec.MouseButton1Click:Connect(function() 
    local code = RN_Data.ScriptsDB[CurrentSlot] 
    if code ~= "" then 
        pcall(function() 
            local func = loadstring(code) 
            if func then func() end 
        end) 
    end 
end)

scriptBox:GetPropertyChangedSignal("Text"):Connect(function() 
    RN_Data.ScriptsDB[CurrentSlot] = scriptBox.Text 
    SaveConfigs()
end)

PageConfig.Visible = true

local function CreateDrawings(Player)
    local d = {}
    local success = pcall(function()
        d.Box = Drawing.new("Square")
        d.Box.Thickness = 1
        d.Box.Filled = false
        d.Box.Color = Color3.new(1, 1, 1)
        
        d.Line = Drawing.new("Line")
        d.Line.Thickness = 1
        d.Line.Color = Color3.new(1, 1, 1)
        
        d.Health = Drawing.new("Line")
        d.Health.Thickness = 2
        d.Health.Color = Color3.new(0, 1, 0)
    end)
    if success then Storage[Player] = d end
end

local function IsEnemy(Player)
    if not Config.TeamCheck then return true end
    if LocalPlayer.Team == nil then return true end
    return Player.Team ~= LocalPlayer.Team
end

local function IsVisible(TargetPart)
    if not LocalPlayer.Character or not LocalPlayer.Character:FindFirstChild("Head") then return false end
    local rayOrigin = Camera.CFrame.Position
    local rayDirection = TargetPart.Position - rayOrigin
    local raycastParams = RaycastParams.new()
    raycastParams.FilterDescendantsInstances = {LocalPlayer.Character}
    raycastParams.FilterType = Enum.RaycastFilterType.Exclude
    raycastParams.IgnoreWater = true
    local result = workspace:Raycast(rayOrigin, rayDirection, raycastParams)
    if result then
        if result.Instance:IsDescendantOf(TargetPart.Parent) then return true
        else return false end
    end
    return true
end

RunService.RenderStepped:Connect(function()
    Camera = workspace.CurrentCamera
    local Center = Vector2.new(Camera.ViewportSize.X / 2, Camera.ViewportSize.Y / 2)

    for Player, ESP in pairs(Storage) do
        local Char = Player.Character
        if Char and Char:FindFirstChild("HumanoidRootPart") and Char:FindFirstChild("Humanoid") and IsEnemy(Player) then
            local Root = Char.HumanoidRootPart
            local Hum = Char.Humanoid
            local Pos, OnScreen = Camera:WorldToViewportPoint(Root.Position)
            
            if OnScreen and Hum.Health > 0 then
                local Scale = 1 / (Pos.Z * math.tan(math.rad(Camera.FieldOfView * 0.5)) * 2) * 1000
                local W, H = 3 * Scale, 4.5 * Scale
                
                ESP.Box.Visible = Config.Box
                ESP.Box.Size = Vector2.new(W, H)
                ESP.Box.Position = Vector2.new(Pos.X - W/2, Pos.Y - H/2)
                
                ESP.Line.Visible = Config.Line
                ESP.Line.From = Vector2.new(Camera.ViewportSize.X / 2, Camera.ViewportSize.Y)
                ESP.Line.To = Vector2.new(Pos.X, Pos.Y + H/2)
                
                ESP.Health.Visible = Config.Health
                local HealthH = (H * (Hum.Health / Hum.MaxHealth))
                ESP.Health.From = Vector2.new(Pos.X - W/2 - 5, Pos.Y + H/2)
                ESP.Health.To = Vector2.new(Pos.X - W/2 - 5, (Pos.Y + H/2) - HealthH)
            else
                for _, v in pairs(ESP) do v.Visible = false end
            end
        else
            for _, v in pairs(ESP) do v.Visible = false end
        end
    end
    
    if Config.Aimbot then
        local target = nil
        local dist = Config.FOVSize
        
        for _, p in pairs(Players:GetPlayers()) do
            if p ~= LocalPlayer and p.Character and p.Character:FindFirstChild("Head") and IsEnemy(p) then
                local headPart = p.Character.Head
                local headPos, onScreen = Camera:WorldToViewportPoint(headPart.Position)
                
                if onScreen then
                    if Config.VisibleCheck and not IsVisible(headPart) then continue end
                    local mag = (Vector2.new(headPos.X, headPos.Y) - Center).Magnitude
                    if mag < dist then dist = mag target = headPart end
                end
            end
        end
        if target then
            Camera.CFrame = Camera.CFrame:Lerp(CFrame.new(Camera.CFrame.Position, target.Position), Config.Smoothness)
        end
    end
end)

Players.PlayerRemoving:Connect(function(Player)
    if Storage[Player] then for _, v in pairs(Storage[Player]) do v:Remove() end Storage[Player] = nil end
    if Tracers[Player] then Tracers[Player]:Remove() Tracers[Player] = nil end
end)
for _, p in pairs(Players:GetPlayers()) do if p ~= LocalPlayer then CreateDrawings(p) end end
Players.PlayerAdded:Connect(CreateDrawings)

RunService.RenderStepped:Connect(function()
    if HitboxPlayer then
        for _, player in pairs(Players:GetPlayers()) do
            if player ~= LocalPlayer and player.Character and player.Character:FindFirstChild("HumanoidRootPart") then
                local hrp = player.Character.HumanoidRootPart
                hrp.Size = Vector3.new(PlayerHitboxSize, PlayerHitboxSize, PlayerHitboxSize); hrp.Transparency = transparency; hrp.CanCollide = false; hrp.Color = playerFixedColor
            end
        end
    end
    if NPCHitboxLoop then
        local folder = GetPathFromString(NPCHitboxDir)
        if folder then
            for _, npc in pairs(folder:GetChildren()) do
                if npc:IsA("Model") and npc:FindFirstChild("HumanoidRootPart") and not Players:GetPlayerFromCharacter(npc) then
                    local hrp = npc.HumanoidRootPart
                    hrp.Size = Vector3.new(NPCHitboxSize, NPCHitboxSize, NPCHitboxSize); hrp.Transparency = 0.5; hrp.Color = npcFixedColor; hrp.Material = Enum.Material.Neon; hrp.CanCollide = false
                end
            end
        end
    end
    for _, player in pairs(Players:GetPlayers()) do
        if player ~= LocalPlayer then
            if TracersActive then
                if not Tracers[player] then CreateTracer(player) end
                local Tracer = Tracers[player]
                if player.Character and player.Character:FindFirstChild("HumanoidRootPart") and player.Character:FindFirstChild("Humanoid") and player.Character.Humanoid.Health > 0 then
                    local Vector, OnScreen = workspace.CurrentCamera:WorldToViewportPoint(player.Character.HumanoidRootPart.Position)
                    if OnScreen then Tracer.From = Vector2.new(workspace.CurrentCamera.ViewportSize.X / 2, 0); Tracer.To = Vector2.new(Vector.X, Vector.Y); Tracer.Visible = true else Tracer.Visible = false end
                else if Tracers[player] then Tracers[player].Visible = false end end
            else if Tracers[player] then Tracers[player].Visible = false end end

            if ChamsActive then
                if player.Character and player.Character:FindFirstChild("HumanoidRootPart") and player.Character:FindFirstChild("Humanoid") and player.Character.Humanoid.Health > 0 then
                    local cham = player.Character:FindFirstChild("RN_Chams")
                    if not cham then cham = Instance.new("Highlight"); cham.Name = "RN_Chams"; cham.Parent = player.Character; cham.FillTransparency = 0.5; cham.OutlineTransparency = 0.2; cham.DepthMode = Enum.HighlightDepthMode.AlwaysOnTop; cham.Adornee = player.Character end
                    cham.Enabled = true; cham.FillColor = CustomESPColor; cham.OutlineColor = CustomESPColor
                elseif player.Character and player.Character:FindFirstChild("RN_Chams") then player.Character.RN_Chams.Enabled = false end
            elseif player.Character and player.Character:FindFirstChild("RN_Chams") then player.Character.RN_Chams.Enabled = false end
        end
    end
end)

RunService.Heartbeat:Connect(function()
    if ESPActive then
        local folder = GetPathFromString(ESPDir)
        if folder then for _, v in pairs(folder:GetChildren()) do if v:IsA("BasePart") or v:IsA("Model") or v:IsA("MeshPart") or v:IsA("UnionOperation") then AplicarESP(v) end end end
    end
end)

task.spawn(function()
    while true do
        if FarmPlayerActive then
            pcall(function()
                local char = LocalPlayer.Character
                local root = char and char:FindFirstChild("HumanoidRootPart")
                if root then
                    local target, dist = nil, math.huge
                    for _, p in pairs(Players:GetPlayers()) do
                        if p ~= LocalPlayer and p.Character and p.Character:FindFirstChild("HumanoidRootPart") and p.Character:FindFirstChild("Humanoid") and p.Character.Humanoid.Health > 0 then
                            local isEnemy = true
                            if FarmPlayerTeamCheck and LocalPlayer.Team and p.Team then isEnemy = (LocalPlayer.Team ~= p.Team) end
                            if isEnemy then
                                local d = (p.Character.HumanoidRootPart.Position - root.Position).Magnitude
                                if d < dist then dist = d target = p.Character.HumanoidRootPart end
                            end
                        end
                    end
                    if target then root.Velocity = Vector3.new(0,0,0) root.CFrame = CFrame.new(target.Position + Vector3.new(0, FarmPlayerOffset, 0), target.Position) end
                end
            end)
        end

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
                        root.Velocity = Vector3.new(0,0,0)
                        root.CFrame = CFrame.new(npcRoot.Position + Vector3.new(0, FarmOffset, 0), npcRoot.Position)
                    end
                end
            end)
        end
        
        if FarmAllActive then
            pcall(function()
                local folder = GetPathFromString(FarmAllDir)
                local char = LocalPlayer.Character
                local hrp = char and char:FindFirstChild("HumanoidRootPart")
                if folder and hrp then
                    if not CurrentItemTarget or not CurrentItemTarget.Parent or CurrentItemTarget.Parent ~= folder then
                        CurrentItemTarget = nil
                        for _, v in pairs(folder:GetChildren()) do
                            if v:IsA("Part") or v:IsA("MeshPart") or v:IsA("UnionOperation") or v:IsA("Model") or v:IsA("BasePart") then
                                CurrentItemTarget = v; break
                            end
                        end
                    end
                    if CurrentItemTarget then
                        local targetCF = CurrentItemTarget:IsA("Model") and CurrentItemTarget:GetPivot() or CurrentItemTarget.CFrame
                        moveto(targetCF, FarmAllSpeed)
                    end
                end
            end)
        end

        if IrJogadorAtivo then
            pcall(function()
                local char = LocalPlayer.Character
                local root = char and char:FindFirstChild("HumanoidRootPart")
                if root then
                    local target, dist = nil, math.huge
                    for _, p in pairs(Players:GetPlayers()) do
                        if p ~= LocalPlayer and p.Character and p.Character:FindFirstChild("HumanoidRootPart") and p.Character:FindFirstChild("Humanoid") and p.Character.Humanoid.Health > 0 then
                            local isEnemy = true
                            if IrJogadorTeamCheck and LocalPlayer.Team and p.Team then isEnemy = (LocalPlayer.Team ~= p.Team) end
                            if isEnemy then
                                local d = (p.Character.HumanoidRootPart.Position - root.Position).Magnitude
                                if d < dist then dist = d target = p.Character.HumanoidRootPart end
                            end
                        end
                    end
                    if target then moveto(target.CFrame, TweenSpeed) end
                end
            end)
        end

        if ItemLoop then 
            pcall(function() 
                local targetObj = (ItemDirectPath ~= "" and GetPathFromString(ItemDirectPath)) or GetNextTargetFromMultiList(ItemDir, ItemTarget) 
                local char = LocalPlayer.Character 
                if targetObj and char then char:PivotTo(targetObj:IsA("Model") and targetObj:GetPivot() or targetObj.CFrame) end 
            end) 
        end
        if LoopColeta then pcall(ExecutarColeta) end

        task.wait()
    end
end)
